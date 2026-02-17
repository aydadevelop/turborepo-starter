import { app } from "./app";

const assistantApp: ExportedHandler = {
	fetch: app.fetch,
};

export default assistantApp;
