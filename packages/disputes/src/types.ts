import type { db } from "@my-app/db";

export type Db = typeof db;

export type {
	CancellationPolicyInput,
	CancellationPolicyDecision,
} from "./cancellation-policy-service";
