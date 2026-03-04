import * as pulumi from "@pulumi/pulumi";
import * as https from "https";

const API_BASE = "https://www.1gb.ru/api";

// ── 1gb.ru API helpers ──────────────────────────────────────────────────────

function apiGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ""}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON from ${path}: ${data.slice(0, 200)}`));
        }
      });
    }).on("error", reject);
  });
}

function md5(input: string): string {
  return require("crypto").createHash("md5").update(input).digest("hex");
}

async function authenticate(token?: string, login?: string, otp?: string): Promise<string> {
  if (token) return token;
  if (!login || !otp) throw new Error("1gb: need token or login+otp");

  const saltResp = await apiGet("/auth/start", { login });
  const salt = saltResp?.[0];
  if (!salt) throw new Error("1gb: failed to get auth salt");

  const response = md5(`${otp}${salt}\n`);
  const authResp = await apiGet("/auth/login", { login, salt, response });
  const tok = authResp?.[0];
  if (!tok || tok.startsWith("ERROR")) throw new Error(`1gb: auth failed: ${tok}`);
  return tok;
}

async function waitForSsh(ip: string, timeoutMs = 120_000): Promise<void> {
  const net = require("net");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(3000);
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => { sock.destroy(); resolve(false); });
      sock.once("timeout", () => { sock.destroy(); resolve(false); });
      sock.connect(22, ip);
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 5000));
  }
  // Don't fail — VPS might still be booting but IP is valid
  pulumi.log.warn(`SSH not ready on ${ip} after ${timeoutMs / 1000}s — continuing anyway`);
}

// ── Dynamic resource provider ───────────────────────────────────────────────

interface OneGbVpsInputs {
  token?: string;
  login?: string;
  otp?: string;
  vcpu: number;
  memoryMb: number;
  diskGb: number;
  template: string;
}

interface OneGbVpsOutputs extends OneGbVpsInputs {
  serverId: string;
  ip: string;
  password: string;
}

const oneGbVpsProvider: pulumi.dynamic.ResourceProvider = {
  async create(inputs: OneGbVpsInputs): Promise<pulumi.dynamic.CreateResult> {
    const token = await authenticate(inputs.token, inputs.login, inputs.otp);

    // Create VPS
    const createResp = await apiGet("/vds/create", {
      _token_: token,
      type: "vds.dynamic.nv",
      cr_hvcpu: String(inputs.vcpu),
      cr_hvmem: String(inputs.memoryMb),
      cr_hvdsk: String(inputs.diskGb),
      cr_ssd1: "1",
      template: inputs.template,
    });

    const serverId = createResp?.[0];
    if (!serverId || serverId === "null" || String(serverId).startsWith("ERROR")) {
      throw new Error(`1gb: VPS creation failed: ${JSON.stringify(createResp)}`);
    }

    // Poll until VPS has an IP (max 10 min)
    let ip = "";
    for (let i = 0; i < 120; i++) {
      const statusResp = await apiGet("/vds/list", { _token_: token, _key_: String(serverId) });
      const pending = statusResp?.[0]?.pending_creation ?? "1";

      if (String(pending) === "0") {
        const ipResp = await apiGet("/vds/ip/list", { _token_: token, _key_: String(serverId) });
        ip = ipResp?.[0]?.ip ?? "";
        if (ip && ip !== "null") break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!ip) throw new Error(`1gb: VPS ${serverId} never got an IP after 10min`);

    // Fetch root password from VPS details
    const detailResp = await apiGet("/vds/list", { _token_: token, _key_: String(serverId) });
    const password = detailResp?.[0]?.pwd ?? "";

    await waitForSsh(ip);

    return {
      id: String(serverId),
      outs: { ...inputs, serverId: String(serverId), ip, password } as any,
    };
  },

  async update(id: string, olds: OneGbVpsOutputs, news: OneGbVpsInputs): Promise<pulumi.dynamic.UpdateResult> {
    const token = await authenticate(news.token, news.login, news.otp);
    try {
      const ipResp = await apiGet("/vds/ip/list", { _token_: token, _key_: id });
      const ip = ipResp?.[0]?.ip ?? olds.ip;
      const detailResp = await apiGet("/vds/list", { _token_: token, _key_: id });
      const password = detailResp?.[0]?.pwd ?? olds.password;
      return { outs: { ...news, serverId: id, ip, password } as any };
    } catch {
      return { outs: { ...news, serverId: id, ip: olds.ip, password: olds.password } as any };
    }
  },

  async read(id: string, props: OneGbVpsOutputs): Promise<pulumi.dynamic.ReadResult> {
    const token = await authenticate(props.token, props.login, props.otp);

    // Verify VPS still exists and get current IP
    try {
      const ipResp = await apiGet("/vds/ip/list", { _token_: token, _key_: id });
      const ip = ipResp?.[0]?.ip ?? props.ip;
      const detailResp = await apiGet("/vds/list", { _token_: token, _key_: id });
      const password = detailResp?.[0]?.pwd ?? props.password;
      return { id, props: { ...props, serverId: id, ip, password } as any };
    } catch {
      // If API call fails, return stored state
      return { id, props: props as any };
    }
  },

  async delete(id: string, props: OneGbVpsOutputs): Promise<void> {
    const token = await authenticate(props.token, props.login, props.otp);
    await apiGet("/vds/delete", { _token_: token, _key_: id });
  },
};

// ── Public component ────────────────────────────────────────────────────────

interface OneGbVpsArgs {
  /** Pre-authenticated API token (preferred over login+otp) */
  token?: pulumi.Input<string>;
  /** 1gb.ru login — used if token is not set */
  login?: pulumi.Input<string>;
  /** 1gb.ru OTP — used if token is not set */
  otp?: pulumi.Input<string>;
  /** Number of vCPUs (default: 2) */
  vcpu?: pulumi.Input<number>;
  /** Memory in MB (default: 4096) */
  memoryMb?: pulumi.Input<number>;
  /** Disk in GB (default: 40) */
  diskGb?: pulumi.Input<number>;
  /** OS template (default: Ubuntu 24.04) */
  template?: pulumi.Input<string>;
}

export class OneGbVps extends pulumi.dynamic.Resource {
  public readonly serverId!: pulumi.Output<string>;
  public readonly ip!: pulumi.Output<string>;
  public readonly password!: pulumi.Output<string>;

  constructor(name: string, args: OneGbVpsArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      oneGbVpsProvider,
      name,
      {
        serverId: undefined,
        ip: undefined,
        password: undefined,
        token: args.token,
        login: args.login,
        otp: args.otp,
        vcpu: args.vcpu ?? 2,
        memoryMb: args.memoryMb ?? 4096,
        diskGb: args.diskGb ?? 40,
        template: args.template ?? "nv.lin.ubuntu2404v1",
      },
      { ...opts, protect: true }, // Protect by default — don't accidentally delete VPS
    );
  }
}
