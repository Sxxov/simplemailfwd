import Mailjet from 'node-mailjet';
import * as dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';

import { StatusCodes as HTTPStatusCodes } from 'http-status-codes';
import { IllegalStateError } from './resources/errors/illegalState.error.js';
import { isValidEmailAddress, sanitizeEmail } from './sanitize.js';

dotenv.config();

if (!process.env.MAILJET_API_KEY
	|| !process.env.MAILJET_SECRET
	|| !process.env.MAILJET_SENDER) {
	throw new IllegalStateError('Falsish MailJet API key/secret/sender email');
}

const port = process.env.PORT ?? 80;
const mailjet = Mailjet.connect(
	process.env.MAILJET_API_KEY!,
	process.env.MAILJET_SECRET!,
);

const app = express();
const ipToRememberedAttempts = new Map<string, number>();

app.use(cors);
app.use(express.static('public'));
app.use(morgan('tiny'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/v1', (req, res) => {
	res.sendStatus(HTTPStatusCodes.IM_A_TEAPOT);
});

app.post('/api/v1/email', async (req, res) => {
	const { ip } = req;

	let rememberedAttempts = ipToRememberedAttempts.get(ip);

	if (rememberedAttempts == null) {
		rememberedAttempts = 0;
		ipToRememberedAttempts.set(ip, rememberedAttempts);
	}

	if (rememberedAttempts > 3) {
		return res
			.sendStatus(HTTPStatusCodes.TOO_MANY_REQUESTS);
	}

	const {
		name,
		email,
		subject,
		content,
	} = req.body as Record<string, string>;

	if (!name
		|| !email
		|| !subject
		|| !content
		|| !isValidEmailAddress(email)) {
		return res
			.sendStatus(HTTPStatusCodes.BAD_REQUEST);
	}

	ipToRememberedAttempts.set(ip, rememberedAttempts + 1);
	setTimeout(() => {
		const rememberedAttempts = ipToRememberedAttempts.get(ip) ?? 1;

		ipToRememberedAttempts.set(ip, rememberedAttempts - 1);
	}, 10 * 60 * 1000);

	await mailjet
		.post('send', { version: 'v3.1' })
		.request({
			Messages: [
				{
					From: {
						Email: process.env.MAILJET_SENDER,
						Name: '_',
					},
					To: [
						{
							Email: process.env.MAILJET_SENDER,
							Name: '_',
						},
					],
					Subject: subject,
					HTMLPart: sanitizeEmail(content),
				},
			],
		});

	return res
		.sendStatus(HTTPStatusCodes.OK);
});

app.use((req, res) => {
	res.sendStatus(HTTPStatusCodes.NOT_FOUND);
});

app.listen(port, () => {
	console.log(`Listening on port ${port}`);
});
