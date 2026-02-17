#!/usr/bin/env node

/**
 * Setup script for Google Calendar credentials
 * 
 * This script reads the google-calendar.credentials.json file from .secrets/
 * and generates the properly formatted GOOGLE_CALENDAR_CREDENTIALS_JSON env variable
 * for use in .env files.
 * 
 * Usage:
 *   node scripts/setup-google-calendar-env.mjs
 *   node scripts/setup-google-calendar-env.mjs >> apps/server/.env
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const credentialsPath = resolve(
	process.cwd(),
	'apps/server/.secrets/google-calendar.credentials.json'
);

try {
	const credentials = readFileSync(credentialsPath, 'utf-8');
	const parsed = JSON.parse(credentials);

	// Ensure the credentials have the required fields
	if (!parsed.client_email || !parsed.private_key) {
		console.error(
			'❌ Invalid credentials: missing client_email or private_key'
		);
		process.exit(1);
	}

	// Output the env variable assignment (minified JSON on single line)
	const minifiedJson = JSON.stringify(parsed);
	console.log(`GOOGLE_CALENDAR_CREDENTIALS_JSON=${minifiedJson}`);
	console.log('');
	console.log('✅ Credentials loaded successfully!');
	console.log('📋 Copy the above line to your .env file in apps/server/');
} catch (error) {
	if (error.code === 'ENOENT') {
		console.error(
			`❌ Credentials file not found at: ${credentialsPath}`
		);
		console.error('');
		console.error(
			'📝 To set up Google Calendar credentials:'
		);
		console.error(`1. Place your Google Service Account JSON file at:`);
		console.error(`   ${credentialsPath}`);
		console.error(`2. Rename the file to: google-calendar.credentials.json`);
		console.error(`3. Run this script again: node scripts/setup-google-calendar-env.mjs`);
	} else {
		console.error('❌ Error reading credentials:', error.message);
	}
	process.exit(1);
}
