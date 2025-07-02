const { run } = require('@airtable/blocks/backend');

// Backend API handler for OpenPhone integration
run(async (event, context) => {
    const { method, path, query, body } = event;
    
    // Handle OpenPhone API requests
    if (path === '/api/openphone/messages' && method === 'GET') {
        try {
            const { phoneNumberId, participants, apiKey } = query;
            
            if (!phoneNumberId || !participants || !apiKey) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Missing required parameters: phoneNumberId, participants, apiKey'
                    })
                };
            }
            
            // Make the OpenPhone API call from the backend
            const url = `https://api.openphone.com/v1/messages?maxResults=50&phoneNumberId=${phoneNumberId}&participants=${encodeURIComponent(participants)}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    statusCode: 200,
                    body: JSON.stringify(data)
                };
            } else {
                const errorText = await response.text();
                return {
                    statusCode: response.status,
                    body: JSON.stringify({
                        error: 'OpenPhone API request failed',
                        status: response.status,
                        statusText: response.statusText,
                        body: errorText
                    })
                };
            }
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Internal server error',
                    message: error.message
                })
            };
        }
    }
    
    // Handle sending messages
    if (path === '/api/openphone/send' && method === 'POST') {
        try {
            const { phoneNumberId, to, text, apiKey } = body;
            
            if (!phoneNumberId || !to || !text || !apiKey) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Missing required parameters: phoneNumberId, to, text, apiKey'
                    })
                };
            }
            
            // Make the OpenPhone API call to send a message
            const url = 'https://api.openphone.com/v1/messages';
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phoneNumberId,
                    to: [to],
                    text
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    statusCode: 200,
                    body: JSON.stringify(data)
                };
            } else {
                const errorText = await response.text();
                return {
                    statusCode: response.status,
                    body: JSON.stringify({
                        error: 'Failed to send message',
                        status: response.status,
                        statusText: response.statusText,
                        body: errorText
                    })
                };
            }
        } catch (error) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Internal server error',
                    message: error.message
                })
            };
        }
    }
    
    // Default response for unknown endpoints
    return {
        statusCode: 404,
        body: JSON.stringify({
            error: 'Endpoint not found'
        })
    };
}); 