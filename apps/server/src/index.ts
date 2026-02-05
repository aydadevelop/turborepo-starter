import { devToolsMiddleware } from "@ai-sdk/devtools";
import { createOpenAI } from "@ai-sdk/openai";
import { createContext } from "@full-stack-cf-app/api/context";
import { appRouter } from "@full-stack-cf-app/api/routers/index";
import { auth } from "@full-stack-cf-app/auth";
import { env } from "@full-stack-cf-app/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import {
	convertToModelMessages,
	generateObject,
	streamText,
	wrapLanguageModel,
} from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

const app = new Hono();

const parseCorsOrigins = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);

const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);

if (corsOrigins.length === 0) {
	throw new Error(
		"CORS_ORIGIN is required. Provide a comma-separated list of allowed origins."
	);
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";

const preparationInputSchema = z.object({
	topic: z.string().trim().min(2),
	goal: z.string().trim().optional().default(""),
	level: z.string().trim().optional().default("Beginner"),
	timePerWeek: z.string().trim().optional().default("3"),
	background: z.string().trim().optional().default(""),
	constraints: z.string().trim().optional().default(""),
	learningStyle: z.string().trim().optional().default("Mixed"),
});

const preparationSchema = z.object({
	title: z.string(),
	summary: z.string(),
	prerequisites: z.array(z.string()),
	roadmap: z.array(z.string()),
	firstWeek: z.array(z.string()),
	resources: z.array(z.string()),
	pitfalls: z.array(z.string()),
});

const exerciseInputSchema = z.object({
	topic: z.string().trim().min(2),
	focus: z.string().trim().optional().default("Core fundamentals"),
	level: z.string().trim().optional().default("Beginner"),
	questionCount: z.number().int().min(3).max(12).optional().default(6),
	format: z
		.enum(["mixed", "conceptual", "practical", "rapid"])
		.optional()
		.default("mixed"),
});

const exerciseSchema = z.object({
	title: z.string(),
	instructions: z.string(),
	questions: z.array(
		z.object({
			question: z.string(),
			answer: z.string(),
			difficulty: z.enum(["easy", "medium", "hard"]),
		})
	),
});

const gradeInputSchema = z.object({
	topic: z.string().trim().min(2),
	level: z.string().trim().optional().default("Beginner"),
	questions: z.array(
		z.object({
			question: z.string(),
			answer: z.string(),
			userAnswer: z.string(),
		})
	),
});

const gradeSchema = z.object({
	score: z.number().min(0).max(100),
	overallFeedback: z.string(),
	perQuestion: z.array(
		z.object({
			question: z.string(),
			feedback: z.string(),
			score: z.number().min(0).max(10),
		})
	),
	nextSteps: z.array(z.string()),
});

const createModel = () => {
	const apiKey = env.OPEN_ROUTER_API_KEY;
	if (!apiKey) {
		return null;
	}

	const openai = createOpenAI({
		apiKey,
		baseURL: OPENROUTER_BASE_URL,
		headers: {
			"HTTP-Referer": env.BETTER_AUTH_URL,
			"X-Title": "LearnFlow",
		},
	});

	return wrapLanguageModel({
		model: openai(OPENROUTER_DEFAULT_MODEL),
		middleware: devToolsMiddleware(),
	});
};

app.use(logger());
app.use(
	"/*",
	cors({
		origin: corsOrigins,
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	})
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context,
	});

	if (rpcResult.matched) {
		return c.newResponse(rpcResult.response.body, rpcResult.response);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context,
	});

	if (apiResult.matched) {
		return c.newResponse(apiResult.response.body, apiResult.response);
	}

	await next();
});

app.post("/ai", async (c) => {
	const model = createModel();
	if (!model) {
		return c.json(
			{
				error:
					"AI features disabled. Set OPEN_ROUTER_API_KEY to enable.",
			},
			503
		);
	}

	const body = await c.req.json();
	const uiMessages = body.messages || [];
	const result = streamText({
		model,
		messages: await convertToModelMessages(uiMessages),
	});

	return result.toUIMessageStreamResponse();
});

app.post("/ai/prepare", async (c) => {
	try {
		const model = createModel();
		if (!model) {
			return c.json(
				{
					error:
						"AI features disabled. Set OPEN_ROUTER_API_KEY to enable.",
				},
				503
			);
		}

		const body = await c.req.json();
		const parsed = preparationInputSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(
				{ error: "Invalid payload", issues: parsed.error.flatten() },
				400
			);
		}

		const { object } = await generateObject({
			model,
			schema: preparationSchema,
			system:
				"You are a learning designer for complete newcomers. Produce concise, friendly guidance. Avoid URLs and keep items short.",
			prompt: `Create a preparation brief for a newcomer.
Topic: ${parsed.data.topic}
Goal: ${parsed.data.goal || "Get started confidently"}
Current level: ${parsed.data.level}
Time per week: ${parsed.data.timePerWeek} hours
Background: ${parsed.data.background || "None provided"}
Constraints: ${parsed.data.constraints || "None"}
Learning style: ${parsed.data.learningStyle}

Make the roadmap practical and realistic for the stated time.`,
		});

		return c.json(object);
	} catch (error) {
		console.error(error);
		return c.json({ error: "Failed to generate preparation plan" }, 500);
	}
});

app.post("/ai/exercise", async (c) => {
	try {
		const model = createModel();
		if (!model) {
			return c.json(
				{
					error:
						"AI features disabled. Set OPEN_ROUTER_API_KEY to enable.",
				},
				503
			);
		}

		const body = await c.req.json();
		const parsed = exerciseInputSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(
				{ error: "Invalid payload", issues: parsed.error.flatten() },
				400
			);
		}

		const { object } = await generateObject({
			model,
			schema: exerciseSchema,
			system:
				"You are a learning coach. Generate clear, beginner-friendly practice questions with short answer keys. Avoid URLs.",
			prompt: `Create a practice set.
Topic: ${parsed.data.topic}
Focus: ${parsed.data.focus}
Level: ${parsed.data.level}
Format: ${parsed.data.format}
Number of questions: ${parsed.data.questionCount}

Balance conceptual understanding with practical recall.`,
		});

		return c.json(object);
	} catch (error) {
		console.error(error);
		return c.json({ error: "Failed to generate exercises" }, 500);
	}
});

app.post("/ai/grade", async (c) => {
	try {
		const model = createModel();
		if (!model) {
			return c.json(
				{
					error:
						"AI features disabled. Set OPEN_ROUTER_API_KEY to enable.",
				},
				503
			);
		}

		const body = await c.req.json();
		const parsed = gradeInputSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(
				{ error: "Invalid payload", issues: parsed.error.flatten() },
				400
			);
		}
		const questionPayload = parsed.data.questions
			.map(
				(item, index) =>
					`Q${index + 1}: ${item.question}\nAnswer key: ${item.answer}\nLearner answer: ${item.userAnswer}`
			)
			.join("\n\n");

		const { object } = await generateObject({
			model,
			schema: gradeSchema,
			system:
				"You are a supportive assessor. Score fairly, explain gaps, and suggest next steps. Keep feedback constructive and concise.",
			prompt: `Evaluate the learner answers.
Topic: ${parsed.data.topic}
Level: ${parsed.data.level}

${questionPayload}

Return a score from 0 to 100 and per-question feedback.`,
		});

		return c.json(object);
	} catch (error) {
		console.error(error);
		return c.json({ error: "Failed to evaluate answers" }, 500);
	}
});

app.get("/", (c) => {
	return c.text("OK");
});

export default app;
