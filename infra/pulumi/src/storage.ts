import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

interface StorageResourcesArgs {
	accountId: pulumi.Input<string>;
	bucketName: pulumi.Input<string>;
	publicDomain: pulumi.Input<string>;
	zoneId: pulumi.Input<string>;
}

export class StorageResources extends pulumi.ComponentResource {
	public readonly bucketName: pulumi.Output<string>;
	public readonly publicBaseUrl: pulumi.Output<string>;

	constructor(
		name: string,
		args: StorageResourcesArgs,
		opts?: pulumi.ComponentResourceOptions,
	) {
		super("myapp:infra:StorageResources", name, {}, opts);

		const bucket = new cloudflare.R2Bucket(
			`${name}-public-bucket`,
			{
				accountId: args.accountId,
				name: args.bucketName,
				location: "weur",
				storageClass: "Standard",
			},
			{ parent: this },
		);

		const customDomain = new cloudflare.R2CustomDomain(
			`${name}-public-domain`,
			{
				accountId: args.accountId,
				bucketName: bucket.name,
				domain: args.publicDomain,
				enabled: true,
				zoneId: args.zoneId,
				minTls: "1.2",
			},
			{ parent: this },
		);

		this.bucketName = bucket.name;
		this.publicBaseUrl = pulumi.interpolate`https://${customDomain.domain}`;

		this.registerOutputs({
			bucketName: this.bucketName,
			publicBaseUrl: this.publicBaseUrl,
		});
	}
}
