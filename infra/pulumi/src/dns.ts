import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

interface DnsRecordsArgs {
  domain: string;
  vpsIp: pulumi.Input<string>;
}

/**
 * Create Cloudflare DNS records pointing subdomains to the VPS.
 * Reads cloudflare:apiToken from provider config, dns:zoneId from app config.
 */
export class DnsRecords extends pulumi.ComponentResource {
  constructor(name: string, args: DnsRecordsArgs, opts?: pulumi.ComponentResourceOptions) {
    super("myapp:infra:DnsRecords", name, {}, opts);

    const dnsConfig = new pulumi.Config("dns");
    const zoneId = dnsConfig.require("zoneId");

    // Root domain + subdomains that need A records
    const subdomains = [
      { name: "@", comment: "Web app" },
      { name: "api", comment: "API server" },
      { name: "assistant", comment: "AI assistant" },
      { name: "notifications", comment: "Notifications service" },
      { name: "grafana", comment: "Grafana dashboard" },
    ];

    for (const sub of subdomains) {
      new cloudflare.DnsRecord(`${name}-${sub.name}`, {
        zoneId,
        name: sub.name === "@" ? args.domain : `${sub.name}.${args.domain}`,
        type: "A",
        content: args.vpsIp,
        proxied: false, // Dokku handles SSL via Let's Encrypt
        ttl: 300,
        comment: sub.comment,
      }, { parent: this });
    }

    this.registerOutputs({});
  }
}
