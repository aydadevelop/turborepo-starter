import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

interface SupportEmailRoutingArgs {
	domain: pulumi.Input<string>;
	localPart: pulumi.Input<string>;
	workerScriptName: pulumi.Input<string>;
	zoneId: pulumi.Input<string>;
}

export class SupportEmailRouting extends pulumi.ComponentResource {
	readonly address: pulumi.Output<string>;
	readonly dnsStatus: pulumi.Output<string>;

	constructor(
		name: string,
		args: SupportEmailRoutingArgs,
		opts?: pulumi.ComponentResourceOptions,
	) {
		super("myapp:infra:SupportEmailRouting", name, {}, opts);

		const settings = new cloudflare.EmailRoutingSettings(
			`${name}-settings`,
			{
				zoneId: args.zoneId,
			},
			{ parent: this },
		);

		this.address = pulumi.interpolate`${args.localPart}@${args.domain}`;

		const dns = new cloudflare.EmailRoutingDns(
			`${name}-dns`,
			{
				name: args.domain,
				zoneId: args.zoneId,
			},
			{ dependsOn: [settings], parent: this },
		);

		new cloudflare.EmailRoutingRule(
			`${name}-worker-rule`,
			{
				actions: [
					{
						type: "worker",
						values: [args.workerScriptName],
					},
				],
				enabled: true,
				matchers: [
					{
						field: "to",
						type: "literal",
						value: this.address,
					},
				],
				name: pulumi.interpolate`Support email -> ${args.workerScriptName}`,
				priority: 0,
				zoneId: args.zoneId,
			},
			{ dependsOn: [settings], parent: this },
		);

		this.dnsStatus = dns.status;

		this.registerOutputs({
			address: this.address,
			dnsStatus: this.dnsStatus,
		});
	}
}
