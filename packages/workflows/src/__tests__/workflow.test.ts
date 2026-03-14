import { clearEventPushers, EventBus } from "@my-app/events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStep } from "../create-step";
import { createWorkflow } from "../create-workflow";
import type { WorkflowContext } from "../types";

const makeCtx = (overrides?: Partial<WorkflowContext>): WorkflowContext => ({
	organizationId: "org-1",
	idempotencyKey: "wf-key-1",
	eventBus: new EventBus(),
	...overrides,
});

describe("createStep + createWorkflow", () => {
	beforeEach(() => {
		clearEventPushers();
	});

	it("happy path: two steps execute sequentially and return { success: true, output }", async () => {
		const step1 = createStep("step-1", (input: { value: number }) => {
			return Promise.resolve({ doubled: input.value * 2 });
		});

		const step2 = createStep("step-2", (input: { doubled: number }) => {
			return Promise.resolve({ tripled: input.doubled * 3 });
		});

		const workflow = createWorkflow(
			"test-wf",
			async (input: { value: number }, ctx) => {
				const r1 = await step1(input, ctx);
				return step2(r1, ctx);
			},
		);

		const result = await workflow.execute({ value: 5 }, makeCtx());

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.output).toEqual({ tripled: 30 });
		}
	});

	it("failure path: step 2 throws, step 1 compensation is called, returns { success: false, error }", async () => {
		const compensate1 = vi
			.fn<() => Promise<void>>()
			.mockResolvedValue(undefined);

		const step1 = createStep(
			"step-1",
			(_input: null) => Promise.resolve({ result: "step-1-output" as string }),
			compensate1 as (
				output: { result: string },
				ctx: WorkflowContext,
			) => Promise<void>,
		);

		const step2 = createStep("step-2", (_input: { result: string }) => {
			return Promise.reject(new Error("step-2 failed"));
		});

		const workflow = createWorkflow("test-wf", async (input: null, ctx) => {
			const r1 = await step1(input, ctx);
			await step2(r1, ctx);
		});

		const result = await workflow.execute(null, makeCtx());

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.message).toBe("step-2 failed");
		}

		expect(compensate1).toHaveBeenCalledOnce();
		expect(compensate1).toHaveBeenCalledWith(
			{ result: "step-1-output" },
			expect.objectContaining({ organizationId: "org-1" }),
		);
	});

	it("reverse compensation: A, B, C sequence where C throws; compensation runs B then A (not C)", async () => {
		const callOrder: string[] = [];

		const compA = vi.fn().mockImplementation(() => {
			callOrder.push("comp-A");
			return Promise.resolve();
		});
		const compB = vi.fn().mockImplementation(() => {
			callOrder.push("comp-B");
			return Promise.resolve();
		});

		const stepA = createStep(
			"step-A",
			(_: null) => Promise.resolve("a-output"),
			compA,
		);
		const stepB = createStep(
			"step-B",
			(_: string) => Promise.resolve("b-output"),
			compB,
		);
		const stepC = createStep("step-C", (_: string) => {
			return Promise.reject(new Error("C exploded"));
		});

		const workflow = createWorkflow("test-wf", async (input: null, ctx) => {
			const a = await stepA(input, ctx);
			const b = await stepB(a, ctx);
			await stepC(b, ctx);
		});

		await workflow.execute(null, makeCtx());

		// B completed before C threw, so compensation runs in reverse: B, then A
		expect(callOrder).toEqual(["comp-B", "comp-A"]);
	});

	it("compensation failure is swallowed: compensate that throws does not propagate; later compensations still run", async () => {
		const callOrder: string[] = [];

		const compA = vi.fn().mockImplementation(() => {
			callOrder.push("comp-A");
			return Promise.resolve();
		});
		const compB = vi.fn().mockImplementation(() => {
			callOrder.push("comp-B-throw");
			return Promise.reject(new Error("compensation B failed"));
		});

		const stepA = createStep(
			"step-A",
			(_: null) => Promise.resolve("a"),
			compA,
		);
		const stepB = createStep(
			"step-B",
			(_: string) => Promise.resolve("b"),
			compB,
		);
		const stepC = createStep("step-C", (_: string) => {
			return Promise.reject(new Error("C failed"));
		});

		const workflow = createWorkflow("test-wf", async (input: null, ctx) => {
			const a = await stepA(input, ctx);
			const b = await stepB(a, ctx);
			await stepC(b, ctx);
		});

		// Should not throw even though compensate-B throws
		const result = await workflow.execute(null, makeCtx());

		expect(result.success).toBe(false);
		// comp-B threw but comp-A still ran
		expect(callOrder).toEqual(["comp-B-throw", "comp-A"]);
	});

	it("eventBus.emit is accessible in steps via ctx.eventBus", async () => {
		const emittedEvents: string[] = [];
		const mockBus = {
			emit: vi.fn().mockImplementation((event: { type: string }) => {
				emittedEvents.push(event.type);
				return Promise.resolve();
			}),
		} as unknown as EventBus;

		const step1 = createStep("step-1", async (_: null, ctx) => {
			await ctx.eventBus.emit({
				type: "booking:created",
				organizationId: ctx.organizationId,
				idempotencyKey: "ev-key-1",
				data: { bookingId: "bk-1", listingId: "ls-1", customerId: "cu-1" },
			});
			return "done";
		});

		const workflow = createWorkflow("test-wf", (input: null, ctx) => {
			return step1(input, ctx);
		});

		await workflow.execute(null, makeCtx({ eventBus: mockBus }));

		expect(mockBus.emit).toHaveBeenCalledOnce();
		expect(emittedEvents).toEqual(["booking:created"]);
	});
});
