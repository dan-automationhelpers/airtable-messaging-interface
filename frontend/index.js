import {initializeBlock, useBase, useRecords, useGlobalConfig, useWatchable, useCustomProperties} from '@airtable/blocks/interface/ui';
import {useState, useEffect, useRef} from 'react';
import './style.css';

function SMSInterface() {
    const base = useBase();
    const globalConfig = useGlobalConfig();
    const customProps = useCustomProperties(
        () => [
            {
                key: 'allowDebugging',
                label: 'Allow Debugging',
                type: 'boolean',
                defaultValue: false,
            },
        ],
        []
    );
    const allowDebugging = customProps?.customPropertyValueByKey?.allowDebugging;
    
    // Get the Clients table
    const clientsTable = base.getTableByName('Clients');
    const clientsRecords = useRecords(clientsTable);
    
    // State for selected client and messages
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [openPhoneApiKey, setOpenPhoneApiKey] = useState('');
    const [openPhoneNumberId, setOpenPhoneNumberId] = useState('');
    const [showApiKeyInput, setShowApiKeyInput] = useState(false);
    const [showDebugPanel, setShowDebugPanel] = useState(false);
    const [debugLogs, setDebugLogs] = useState([]);
    const messagesEndRef = useRef(null);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [templateQuery, setTemplateQuery] = useState("");
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    
    // Template definitions
    const templates = [
        { name: "Greeting", value: (client) => `Hi ${client?.getCellValue('First Name') || ''}` }
    ];
    
    // Filtered templates for autocomplete
    const filteredTemplates = templateQuery
        ? templates.filter(t => t.name.toLowerCase().startsWith(templateQuery.toLowerCase()))
        : [];
    
    // Load API key and phone number ID from global config on component mount
    useEffect(() => {
        const savedApiKey = globalConfig.get('openPhoneApiKey');
        const savedPhoneNumberId = globalConfig.get('openPhoneNumberId');
        
        if (savedApiKey) {
            setOpenPhoneApiKey(savedApiKey);
        }
        if (savedPhoneNumberId) {
            setOpenPhoneNumberId(savedPhoneNumberId);
        }
        
        if (!savedApiKey || !savedPhoneNumberId) {
            setShowApiKeyInput(true);
        }
    }, [globalConfig]);
    
    // Save API key and phone number ID to global config
    const saveApiKey = (apiKey, phoneNumberId) => {
        globalConfig.setAsync('openPhoneApiKey', apiKey);
        globalConfig.setAsync('openPhoneNumberId', phoneNumberId);
        setOpenPhoneApiKey(apiKey);
        setOpenPhoneNumberId(phoneNumberId);
        setShowApiKeyInput(false);
    };
    
    // Add debug log
    const addDebugLog = (message, data = null) => {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            message,
            data
        };
        setDebugLogs(prev => [...prev.slice(-19), logEntry]); // Keep last 20 logs
        console.log(`[${timestamp}] ${message}`, data);
    };
    
    // Format phone number for OpenPhone API
    const formatPhoneNumber = (phoneNumber) => {
        if (!phoneNumber) return null;
        
        // Remove all non-digit characters
        let cleaned = phoneNumber.toString().replace(/\D/g, '');
        
        // Handle different formats
        if (cleaned.length === 10) {
            // US number without country code
            return `+1${cleaned}`;
        } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
            // US number with country code
            return `+${cleaned}`;
        } else if (cleaned.length > 11) {
            // International number
            return `+${cleaned}`;
        } else {
            // Return as is if we can't determine format
            return phoneNumber;
        }
    };
    
    // Fetch messages from OpenPhone API
    const fetchOpenPhoneMessages = async (phoneNumber) => {
        if (!phoneNumber) {
            addDebugLog('Missing phone number');
            return;
        }
        
        const formattedPhone = formatPhoneNumber(phoneNumber);
        
        // Debug information
        addDebugLog('=== OpenPhone API Debug ===');
        addDebugLog('Original phone number', phoneNumber);
        addDebugLog('Formatted phone number', formattedPhone);
        
        setIsLoading(true);
        try {
            // Use Pipedream workflow to avoid CORS issues
            const pipedreamUrl = `https://eonnzavzyaryljw.m.pipedream.net?phone=${encodeURIComponent(formattedPhone)}`;
            addDebugLog('Pipedream URL', pipedreamUrl);
            
            addDebugLog('Making Pipedream API request...');
            const response = await fetch(pipedreamUrl, {
                method: 'GET'
            });
            
            addDebugLog('Response status', response.status);
            
            if (response.ok) {
                const data = await response.json();
                addDebugLog('API Response data', data);
                
                if (data.data && Array.isArray(data.data)) {
                    const formattedMessages = data.data.map(msg => ({
                        id: msg.id,
                        text: msg.text,
                        sender: msg.direction === 'outgoing' ? 'agent' : 'client',
                        timestamp: new Date(msg.createdAt || msg.created_at),
                        status: msg.direction === 'incoming' ? 'delivered' : msg.status
                    })).sort((a, b) => a.timestamp - b.timestamp);
                    
                    addDebugLog('Formatted messages', formattedMessages);
                    setMessages(formattedMessages);
                } else {
                    addDebugLog('Invalid response format - no data array', data);
                    setMessages(getSampleMessages());
                }
            } else {
                const errorText = await response.text();
                addDebugLog('Failed to fetch messages', { status: response.status, statusText: response.statusText, body: errorText });
                
                // Try alternative phone number formats
                await tryAlternativePhoneFormats(phoneNumber);
            }
        } catch (error) {
            addDebugLog('Error fetching messages', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                type: error.constructor.name
            });
            
            // Fallback to sample messages if API fails
            setMessages(getSampleMessages());
        } finally {
            setIsLoading(false);
        }
    };
    
    // Try alternative phone number formats if the first one fails
    const tryAlternativePhoneFormats = async (originalPhone) => {
        addDebugLog('Trying alternative phone number formats...');
        
        const alternatives = [
            originalPhone.replace(/\D/g, ''), // Just digits
            originalPhone.replace(/\D/g, '').replace(/^1/, ''), // Remove leading 1
            `+1${originalPhone.replace(/\D/g, '')}`, // Add +1
            originalPhone.replace(/^\+/, ''), // Remove + if present
            originalPhone.replace(/^1/, ''), // Remove leading 1
        ];
        
        for (const altPhone of alternatives) {
            if (altPhone === originalPhone) continue; // Skip if same as original
            
            addDebugLog('Trying alternative format', altPhone);
            try {
                const pipedreamUrl = `https://eonnzavzyaryljw.m.pipedream.net?phone=${encodeURIComponent(altPhone)}`;
                const response = await fetch(pipedreamUrl, {
                    method: 'GET'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    addDebugLog('Success with alternative format', altPhone);
                    addDebugLog('Alternative response', data);
                    
                    if (data.data && Array.isArray(data.data)) {
                        const formattedMessages = data.data.map(msg => ({
                            id: msg.id,
                            text: msg.text,
                            sender: msg.direction === 'outgoing' ? 'agent' : 'client',
                            timestamp: new Date(msg.createdAt || msg.created_at),
                            status: msg.direction === 'incoming' ? 'delivered' : msg.status
                        })).sort((a, b) => a.timestamp - b.timestamp);
                        
                        setMessages(formattedMessages);
                        return; // Success, exit the loop
                    }
                }
            } catch (error) {
                addDebugLog('Alternative format failed', { 
                    phone: altPhone, 
                    error: error.message,
                    name: error.name,
                    type: error.constructor.name
                });
            }
        }
        
        addDebugLog('All alternative formats failed, using sample messages');
        setMessages(getSampleMessages());
    };
    
    // Sample messages for demonstration
    const getSampleMessages = () => [
        { id: 1, text: "Hi there! How can I help you today?", sender: 'agent', timestamp: new Date(Date.now() - 300000) },
        { id: 2, text: "I have a question about my recent order", sender: 'client', timestamp: new Date(Date.now() - 240000) },
        { id: 3, text: "Of course! What's your order number?", sender: 'agent', timestamp: new Date(Date.now() - 180000) },
        { id: 4, text: "It's #12345", sender: 'client', timestamp: new Date(Date.now() - 120000) },
        { id: 5, text: "Let me look that up for you...", sender: 'agent', timestamp: new Date(Date.now() - 60000) },
    ];
    
    // Initialize messages when component mounts
    useEffect(() => {
        setMessages(getSampleMessages());
    }, []);
    
    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    // Get selected client record
    const selectedClient = clientsRecords?.find(record => record.id === selectedClientId);
    
    // Load messages when client is selected
    useEffect(() => {
        if (selectedClient) {
            const phoneNumber = selectedClient.getCellValue('Phone');
            if (phoneNumber) {
                fetchOpenPhoneMessages(phoneNumber);
            } else {
                setMessages(getSampleMessages());
            }
        }
    }, [selectedClient]);
    
    // Handle sending a new message
    const handleSendMessage = async () => {
        if (newMessage.trim() && selectedClient) {
            const messageId = Date.now(); // Use timestamp as temporary ID
            const message = {
                id: messageId,
                text: newMessage,
                sender: 'agent',
                timestamp: new Date(),
                status: 'queued'
            };
            setMessages(prev => [...prev, message]);
            setNewMessage('');

            // Send message via Pipedream
            try {
                const phoneNumber = selectedClient.getCellValue('Phone');
                if (phoneNumber) {
                    const formattedPhone = formatPhoneNumber(phoneNumber);

                    addDebugLog('Sending message via Pipedream', {
                        message: newMessage,
                        phone: formattedPhone
                    });

                    const response = await fetch('https://eorucjnb25ccodz.m.pipedream.net', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: newMessage,
                            phone: formattedPhone
                        })
                    });

                    if (response.ok) {
                        // Parse the response to check if the actual OpenPhone API call succeeded
                        try {
                            const responseData = await response.json();
                            addDebugLog('Pipedream response', responseData);
                            
                            // Check if there was an error in the OpenPhone API call
                            if (responseData.error || responseData.status === 400 || responseData.status === 500) {
                                addDebugLog('Message failed to send via OpenPhone API', responseData);
                                // Update message status to failed
                                setMessages(prev => prev.map(msg => 
                                    msg.id === messageId ? { ...msg, status: 'failed' } : msg
                                ));
                            } else {
                                addDebugLog('Message sent successfully via Pipedream and OpenPhone API');
                                // Update message status to delivered
                                setMessages(prev => prev.map(msg => 
                                    msg.id === messageId ? { ...msg, status: 'delivered' } : msg
                                ));
                            }
                        } catch (parseError) {
                            addDebugLog('Failed to parse Pipedream response', parseError.message);
                            // Update message status to failed
                            setMessages(prev => prev.map(msg => 
                                msg.id === messageId ? { ...msg, status: 'failed' } : msg
                            ));
                        }
                    } else {
                        addDebugLog('Failed to send message via Pipedream', { status: response.status });
                        // Update message status to failed
                        setMessages(prev => prev.map(msg => 
                            msg.id === messageId ? { ...msg, status: 'failed' } : msg
                        ));
                    }
                }
            } catch (error) {
                addDebugLog('Error sending message via Pipedream', error.message);
                // Update message status to failed
                setMessages(prev => prev.map(msg => 
                    msg.id === messageId ? { ...msg, status: 'failed' } : msg
                ));
            }
        }
    };
    
    // Handle Enter key press
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };
    
    // Format timestamp
    const formatTime = (timestamp) => {
        const now = new Date();
        const messageDate = new Date(timestamp);
        
        // Format time in 12-hour format with AM/PM
        const hours = messageDate.getHours();
        const minutes = messageDate.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        const displayHours = hours % 12 || 12; // Convert 0 to 12 for midnight
        const timeString = `${displayHours}:${minutes} ${ampm}`;
        
        // Check if it's today
        if (messageDate.toDateString() === now.toDateString()) {
            return timeString;
        }
        
        // Check if it's yesterday
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (messageDate.toDateString() === yesterday.toDateString()) {
            return `Yesterday ${timeString}`;
        }
        
        // For older messages, show MM/DD and time
        const month = (messageDate.getMonth() + 1).toString().padStart(2, '0');
        const day = messageDate.getDate().toString().padStart(2, '0');
        return `${month}/${day} ${timeString}`;
    };
    
    // Handle textarea input for @ autocomplete
    const handleInput = (e) => {
        const value = e.target.value;
        setNewMessage(value);
        // Find last @ and get the word after it
        const match = value.match(/@([a-zA-Z]*)$/);
        if (match) {
            setTemplateQuery(match[1]);
            setShowAutocomplete(true);
        } else {
            setTemplateQuery("");
            setShowAutocomplete(false);
        }
    };
    
    // Handle template selection from autocomplete
    const handleTemplateSelect = (template) => {
        if (!selectedClient) return;
        // Replace @query with template value
        setNewMessage(prev => prev.replace(/@([a-zA-Z]*)$/, template.value(selectedClient)));
        setShowAutocomplete(false);
        setTemplateQuery("");
    };
    
    if (!clientsTable) {
        return (
            <div className="p-6 text-center">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">No Clients Table Found</h2>
                <p className="text-gray-600">Please make sure you have a table named "Clients" in your base.</p>
            </div>
        );
    }
    
    // API Key Configuration Modal
    if (showApiKeyInput) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4">OpenPhone API Configuration</h2>
                    <p className="text-gray-600 mb-6">
                        To use the SMS chat interface, you'll need to provide your OpenPhone API key and Phone Number ID. 
                        These will be stored securely in your Airtable base.
                    </p>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                OpenPhone API Key
                            </label>
                            <input
                                type="password"
                                placeholder="Enter your OpenPhone API key"
                                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={openPhoneApiKey}
                                onChange={(e) => setOpenPhoneApiKey(e.target.value)}
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Phone Number ID
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., PNJVC2e8zs"
                                className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={openPhoneNumberId}
                                onChange={(e) => setOpenPhoneNumberId(e.target.value)}
                            />
                        </div>
                        
                        <div className="flex space-x-3">
                            <button
                                onClick={() => saveApiKey(openPhoneApiKey, openPhoneNumberId)}
                                disabled={!openPhoneApiKey.trim() || !openPhoneNumberId.trim()}
                                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                Save & Continue
                            </button>
                            <button
                                onClick={() => {
                                    setOpenPhoneApiKey('');
                                    setOpenPhoneNumberId('');
                                    setShowApiKeyInput(false);
                                }}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                            >
                                Skip
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-6 p-4 bg-blue-50 rounded-md">
                        <h3 className="text-sm font-medium text-blue-800 mb-2">How to get your credentials:</h3>
                        <ol className="text-xs text-blue-700 space-y-1">
                            <li>1. Log into your OpenPhone account</li>
                            <li>2. Go to Settings → API</li>
                            <li>3. Generate a new API key</li>
                            <li>4. Find your Phone Number ID in the API docs or settings</li>
                            <li>5. Copy and paste both values here</li>
                        </ol>
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="h-screen flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 p-4">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-semibold text-gray-800">SMS Chat Interface</h1>
                        <p className="text-sm text-gray-600">Manage client communications</p>
                    </div>
                    {allowDebugging && (
                        <div className="flex space-x-2">
                            <button
                                onClick={() => setShowDebugPanel(!showDebugPanel)}
                                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md"
                            >
                                {showDebugPanel ? 'Hide Debug' : 'Show Debug'}
                            </button>
                            <button
                                onClick={() => setShowApiKeyInput(true)}
                                className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md"
                            >
                                API Settings
                            </button>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Debug Panel */}
            {allowDebugging && showDebugPanel && (
                <div className="bg-gray-900 text-green-400 p-4 font-mono text-xs max-h-64 overflow-y-auto">
                    <div className="flex justify-between items-center mb-2">
                        <div className="font-semibold">Debug Logs:</div>
                        <button
                            onClick={async () => {
                                try {
                                    const debugText = debugLogs.map(log => {
                                        let logText = `[${log.timestamp}] ${log.message}`;
                                        if (log.data) {
                                            logText += '\n' + (typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data);
                                        }
                                        return logText;
                                    }).join('\n\n');
                                    
                                    await navigator.clipboard.writeText(debugText);
                                    
                                    // Show a brief success message
                                    const button = event.target;
                                    const originalText = button.textContent;
                                    button.textContent = '✓';
                                    button.className = 'px-2 py-1 text-xs bg-green-600 text-white rounded transition-colors';
                                    setTimeout(() => {
                                        button.textContent = originalText;
                                        button.className = 'px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors';
                                    }, 1000);
                                } catch (err) {
                                    console.error('Failed to copy debug logs:', err);
                                    // Fallback for older browsers
                                    const textArea = document.createElement('textarea');
                                    textArea.value = debugLogs.map(log => {
                                        let logText = `[${log.timestamp}] ${log.message}`;
                                        if (log.data) {
                                            logText += '\n' + (typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data);
                                        }
                                        return logText;
                                    }).join('\n\n');
                                    document.body.appendChild(textArea);
                                    textArea.select();
                                    document.execCommand('copy');
                                    document.body.removeChild(textArea);
                                    
                                    // Show success message
                                    const button = event.target;
                                    const originalText = button.textContent;
                                    button.textContent = '✓';
                                    button.className = 'px-2 py-1 text-xs bg-green-600 text-white rounded transition-colors';
                                    setTimeout(() => {
                                        button.textContent = originalText;
                                        button.className = 'px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors';
                                    }, 1000);
                                }
                            }}
                            className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                            title="Copy debug logs to clipboard"
                        >
                            📋
                        </button>
                    </div>
                    {debugLogs.length === 0 ? (
                        <div className="text-gray-500">No debug logs yet. Select a client to see API activity.</div>
                    ) : (
                        debugLogs.map((log, index) => (
                            <div key={index} className="mb-1">
                                <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                                {log.data && (
                                    <pre className="mt-1 text-xs bg-gray-800 p-2 rounded overflow-x-auto">
                                        {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
                                    </pre>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
            
            {/* Client Picker */}
            <div className="bg-white border-b border-gray-200 p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Client
                </label>
                <select
                    value={selectedClientId || ''}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="">Choose a client...</option>
                    {clientsRecords?.map(record => (
                        <option key={record.id} value={record.id}>
                            {record.getCellValue('Name') || record.getCellValue('Client Name') || `Client ${record.id}`}
                        </option>
                    ))}
                </select>
                
                {selectedClient && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-md">
                        <p className="text-sm font-medium text-blue-800">
                            Chatting with: {selectedClient.getCellValue('Name') || selectedClient.getCellValue('Client Name') || `Client ${selectedClient.id}`}
                        </p>
                        <p className="text-xs text-blue-600">
                            Phone: {selectedClient.getCellValue('Phone') || 'Not specified'}
                        </p>
                        {(!openPhoneApiKey || !openPhoneNumberId) && (
                            <p className="text-xs text-orange-600 mt-1">
                                ⚠️ Missing API credentials. Using sample messages.
                            </p>
                        )}
                    </div>
                )}
            </div>
            
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] pb-16 bg-gray-50">
                {!selectedClientId ? (
                    <div className="text-center text-gray-500 mt-8">
                        <p>Select a client to start chatting</p>
                    </div>
                ) : isLoading ? (
                    <div className="text-center text-gray-500 mt-8">
                        <p>Loading messages...</p>
                    </div>
                ) : (
                    messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex ${message.sender === 'agent' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                                    message.sender === 'agent'
                                        ? 'bg-blue-500 text-white rounded-br-md'
                                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'
                                }`}
                            >
                                <p className="text-sm leading-relaxed">{message.text}</p>
                                <p className={`text-xs mt-2 ${
                                    message.sender === 'agent' ? 'text-blue-100' : 'text-gray-400'
                                }`}>
                                    {formatTime(message.timestamp)}
                                    {message.status && message.sender === 'agent' && (
                                        (message.status === 'queued' || 
                                         message.status === 'failed' || 
                                         (message.status === 'delivered' && 
                                          Date.now() - message.timestamp.getTime() < 30000)) && (
                                            <span className={`ml-2 ${
                                                message.sender === 'agent' ? 'text-blue-200' : 'text-gray-400'
                                            }`}>
                                                • {message.status === 'queued' && '⏳ '}
                                                {message.status === 'delivered' && '✓ '}
                                                {message.status === 'failed' && '❌ '}
                                                {message.status.charAt(0).toUpperCase() + message.status.slice(1)}
                                            </span>
                                        )
                                    )}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>
            
            {/* Message Input */}
            {selectedClientId && (
                <div className="border-t border-gray-200 p-4 mb-12">
                    <div className="flex space-x-2 items-end">
                        <div className="flex-1 relative">
                            <textarea
                                value={newMessage}
                                onChange={handleInput}
                                onKeyDown={(e) => {
                                    if (showAutocomplete && filteredTemplates.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                                        e.preventDefault();
                                        handleTemplateSelect(filteredTemplates[0]);
                                    }
                                    if (e.key === 'Escape') {
                                        setShowAutocomplete(false);
                                    }
                                }}
                                onKeyPress={handleKeyPress}
                                placeholder="Type your message..."
                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none overflow-hidden"
                                rows="1"
                                style={{
                                    minHeight: '40px',
                                    maxHeight: '120px',
                                    height: 'auto'
                                }}
                                onInput={(e) => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                }}
                                onBlur={() => { setShowTemplatePicker(false); setShowAutocomplete(false); }}
                            />
                            {showAutocomplete && filteredTemplates.length > 0 && (
                                <div className="absolute left-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[120px]">
                                    {filteredTemplates.map((template) => (
                                        <button
                                            key={template.name}
                                            className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                                            onMouseDown={() => handleTemplateSelect(template)}
                                        >
                                            {template.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleSendMessage}
                            disabled={!newMessage.trim()}
                            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            style={{ height: '40px' }}
                        >
                            Send
                        </button>
                    </div>
                    <div className="flex items-center space-x-2 mt-2">
                        <button
                            type="button"
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className="text-gray-500 hover:text-gray-700 p-1 rounded-md focus:outline-none text-lg"
                            title="Add emoji"
                        >
                            <span role="img" aria-label="smile">🙂</span>
                        </button>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowTemplatePicker((v) => !v)}
                                className="text-gray-500 hover:text-gray-700 p-1 rounded-md focus:outline-none text-lg font-bold"
                                title="Insert template"
                            >
                                @
                            </button>
                            {showTemplatePicker && (
                                <div className="absolute left-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[120px]">
                                    <button
                                        className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                                        onClick={() => {
                                            if (selectedClient) {
                                                const firstName = selectedClient.getCellValue('First Name') || '';
                                                setNewMessage(prev => prev + `Hi ${firstName}`);
                                            }
                                            setShowTemplatePicker(false);
                                        }}
                                    >
                                        Greeting
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-300 rounded-lg shadow-lg p-2 z-20">
                            <div className="grid grid-cols-8 gap-1 max-h-32 overflow-y-auto">
                                {['😊', '😂', '❤️', '👍', '👎', '🎉', '🔥', '💯', '😍', '🤔', '😭', '😡', '🤗', '👋', '🙏', '💪', '🎯', '💡', '🚀', '⭐', '💎', '🏆', '🎊', '🎁', '💖', '💕', '💗', '💓', '💝', '💞', '💟', '💌'].map((emoji) => (
                                    <button
                                        key={emoji}
                                        onClick={() => {
                                            setNewMessage(prev => prev + emoji);
                                            setShowEmojiPicker(false);
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded text-lg"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

initializeBlock({interface: () => <SMSInterface />});
