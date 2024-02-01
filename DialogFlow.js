const dialogflow = require('@google-cloud/dialogflow');
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });
const express = require('express');

// Your credentials
const CREDENTIALS = JSON.parse(process.env.CREDENTIALS);

// Other way to read the credentials
// const fs = require('fs');
// const CREDENTIALS = JSON.parse(fs.readFileSync('File path'));

const PROJECID = CREDENTIALS.project_id;

// Configuration for the client
const CONFIGURATION = {
    credentials: {
        private_key: CREDENTIALS['private_key'],
        client_email: CREDENTIALS['client_email']
    }
}

// Create a new session
const sessionClient = new dialogflow.SessionsClient(CONFIGURATION);

// Detect intent method
const detectIntent = async (languageCode, queryText, sessionId) => {

    try {
        let sessionPath = sessionClient.projectAgentSessionPath(PROJECID, sessionId);
        // The text query request.
        let request = {
            session: sessionPath,
            queryInput: {
                text: {
                    // The query to send to the dialogflow agent
                    text: queryText,
                    // The language used by the client (en-US)
                    languageCode: languageCode,
                },
            },
        };

        // Send request and log result
        const responses = await sessionClient.detectIntent(request);
        const result = responses[0].queryResult;

        return result.fulfillmentText
    }
    catch (error) {
        console.log(error)
    }
}

module.exports = detectIntent;
