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
            {
                key: 'editTemplates',
                label: 'Edit Templates',
                type: 'boolean',
                defaultValue: false,
            },
        ],
        []
    );
    const allowDebugging = customProps?.customPropertyValueByKey?.allowDebugging;
    const editTemplates = customProps?.customPropertyValueByKey?.editTemplates;
    
    // Get the Clients table
    const clientsTable = base.getTableByName('Clients');
    const clientsRecords = clientsTable ? useRecords(clientsTable) : [];
    
    // State for selected client and messages
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showDebugPanel, setShowDebugPanel] = useState(false);
    const [debugLogs, setDebugLogs] = useState([]);
    const messagesEndRef = useRef(null);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [templateQuery, setTemplateQuery] = useState("");
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [newName, setNewName] = useState('');
    const [newMessageEdit, setNewMessageEdit] = useState('');
    const [showVariablePicker, setShowVariablePicker] = useState(false);
    const [variableQuery, setVariableQuery] = useState("");
    const [showVariableAutocomplete, setShowVariableAutocomplete] = useState(false);
    const [variableAutocompleteQuery, setVariableAutocompleteQuery] = useState("");
    const [cursorPosition, setCursorPosition] = useState(0);
    const [showTemplateAutocomplete, setShowTemplateAutocomplete] = useState(false);
    const [templateAutocompleteQuery, setTemplateAutocompleteQuery] = useState("");
    const [messageCursorPosition, setMessageCursorPosition] = useState(0);
    
    // Templates table integration
    const templates = globalConfig.get('templates') || [];
    
    // Filtered templates for autocomplete
    const filteredTemplates = templateQuery
        ? templates.filter(r => (r.name || '').toLowerCase().startsWith(templateQuery.toLowerCase()))
        : [];
    
    // Filtered templates for new autocomplete system
    const filteredTemplateAutocomplete = templateAutocompleteQuery
        ? templates.filter(template => 
            (template.name || '').toLowerCase().includes(templateAutocompleteQuery.toLowerCase()) ||
            (template.message || '').toLowerCase().includes(templateAutocompleteQuery.toLowerCase())
          )
        : templates;
    
    // Get available fields from Clients table for variables
    const availableFields = clientsTable ? clientsTable.fields.map(field => ({
        id: field.id,
        name: field.name,
        type: field.type
    })) : [];
    
    // Filtered fields for variable picker
    const filteredFields = variableQuery
        ? availableFields.filter(field => 
            field.name.toLowerCase().includes(variableQuery.toLowerCase()) ||
            normalizeFieldName(field.name).toLowerCase().includes(variableQuery.toLowerCase())
          )
        : availableFields;
    
    // Filtered fields for autocomplete
    const filteredAutocompleteFields = variableAutocompleteQuery
        ? availableFields.filter(field => 
            field.name.toLowerCase().includes(variableAutocompleteQuery.toLowerCase()) ||
            normalizeFieldName(field.name).toLowerCase().includes(variableAutocompleteQuery.toLowerCase())
          )
        : availableFields;
    
    // Function to normalize field names (remove spaces, emojis, punctuation)
    const normalizeFieldName = (fieldName) => {
        if (!fieldName) return '';
        return fieldName
            .replace(/[\s\p{P}\p{Emoji}]/gu, '') // Remove spaces, punctuation, and emojis
            .replace(/[^\w]/g, '') // Remove any remaining non-word characters
            .replace(/^(\d)/, '_$1'); // Add underscore prefix if starts with number
    };
    
    // Function to resolve variables in a template message
    const resolveTemplateVariables = (templateText, clientRecord) => {
        if (!templateText || !clientRecord) return templateText;
        
        // Replace @FieldName with actual field values
        return templateText.replace(/@([a-zA-Z0-9_]+)/g, (match, normalizedFieldName) => {
            // Find the field by matching normalized names
            const field = availableFields.find(f => normalizeFieldName(f.name) === normalizedFieldName);
            if (field) {
                const fieldValue = clientRecord.getCellValue(field.name);
                return fieldValue || match; // Return original if field value is empty
            }
            return match; // Return original if field not found
        });
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
    
    // Fetch messages from OpenPhone API via Pipedream
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
            if (altPhone === originalPhone) continue; // Skip the original format
            
            addDebugLog(`Trying alternative format: ${altPhone}`);
            const pipedreamUrl = `https://eonnzavzyaryljw.m.pipedream.net?phone=${encodeURIComponent(altPhone)}`;
            
            try {
                const response = await fetch(pipedreamUrl, { method: 'GET' });
                if (response.ok) {
                    const data = await response.json();
                    if (data.data && Array.isArray(data.data)) {
                        addDebugLog(`Success with alternative format: ${altPhone}`);
                        const formattedMessages = data.data.map(msg => ({
                            id: msg.id,
                            text: msg.text,
                            sender: msg.direction === 'outgoing' ? 'agent' : 'client',
                            timestamp: new Date(msg.createdAt || msg.created_at),
                            status: msg.direction === 'incoming' ? 'delivered' : msg.status
                        })).sort((a, b) => a.timestamp - b.timestamp);
                        
                        setMessages(formattedMessages);
                        return; // Success, exit the function
                    }
                }
            } catch (error) {
                addDebugLog(`Failed with alternative format ${altPhone}`, error.message);
            }
        }
        
        addDebugLog('All alternative formats failed, using sample messages');
        setMessages(getSampleMessages());
    };

    // Get sample messages for fallback
    const getSampleMessages = () => [
        {
            id: 1,
            text: "Hi! Thanks for reaching out. How can I help you today?",
            sender: 'agent',
            timestamp: new Date(Date.now() - 3600000), // 1 hour ago
            status: 'delivered'
        },
        {
            id: 2,
            text: "I'm interested in your services. Can you tell me more?",
            sender: 'client',
            timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
            status: 'delivered'
        },
        {
            id: 3,
            text: "Absolutely! I'd be happy to walk you through our offerings. What specific area are you looking for help with?",
            sender: 'agent',
            timestamp: new Date(Date.now() - 900000), // 15 minutes ago
            status: 'delivered'
        }
    ];

    // Get selected client record
    const selectedClient = selectedClientId ? clientsRecords.find(record => record.id === selectedClientId) : null;

    // Load messages when client is selected
    useEffect(() => {
        if (selectedClient) {
            const phoneNumber = selectedClient.getCellValue('Phone');
            if (phoneNumber) {
                fetchOpenPhoneMessages(phoneNumber);
            } else {
                setMessages(getSampleMessages());
            }
        } else {
            setMessages([]);
        }
    }, [selectedClientId, selectedClient]);
    
    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
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
        const cursorPos = e.target.selectionStart;
        setNewMessage(value);
        setMessageCursorPosition(cursorPos);
        
        // Find the word being typed at cursor position
        const beforeCursor = value.substring(0, cursorPos);
        const match = beforeCursor.match(/@([a-zA-Z0-9_]*)$/);
        
        if (match) {
            setTemplateAutocompleteQuery(match[1]);
            setShowTemplateAutocomplete(true);
            // Hide the old autocomplete
            setShowAutocomplete(false);
            setTemplateQuery("");
        } else {
            setTemplateAutocompleteQuery("");
            setShowTemplateAutocomplete(false);
        }
    };
    
    // Handle template editor textarea input for variable autocomplete
    const handleTemplateEditorInput = (e) => {
        const value = e.target.value;
        const cursorPos = e.target.selectionStart;
        setNewMessageEdit(value);
        setCursorPosition(cursorPos);
        
        // Find the word being typed at cursor position
        const beforeCursor = value.substring(0, cursorPos);
        const match = beforeCursor.match(/@([a-zA-Z0-9_]*)$/);
        
        if (match) {
            setVariableAutocompleteQuery(match[1]);
            setShowVariableAutocomplete(true);
        } else {
            setVariableAutocompleteQuery("");
            setShowVariableAutocomplete(false);
        }
    };
    
    // Handle variable autocomplete selection
    const handleVariableAutocompleteSelect = (field) => {
        const beforeCursor = newMessageEdit.substring(0, cursorPosition);
        const afterCursor = newMessageEdit.substring(cursorPosition);
        
        // Find the start of the @ variable being typed
        const beforeMatch = beforeCursor.match(/@([a-zA-Z0-9_]*)$/);
        if (beforeMatch) {
            const startPos = beforeCursor.lastIndexOf('@');
            const newValue = newMessageEdit.substring(0, startPos) + 
                           `@${normalizeFieldName(field.name)}` + 
                           afterCursor;
            
            setNewMessageEdit(newValue);
            
            // Set cursor position after the inserted variable
            const newCursorPos = startPos + normalizeFieldName(field.name).length + 1; // +1 for @
            setTimeout(() => {
                const textarea = document.querySelector('textarea[value="' + newValue + '"]');
                if (textarea) {
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                    textarea.focus();
                }
            }, 0);
        }
        
        setShowVariableAutocomplete(false);
        setVariableAutocompleteQuery("");
    };
    
    // Handle template selection from autocomplete
    const handleTemplateSelect = (template) => {
        if (!selectedClient) return;
        const resolvedMessage = resolveTemplateVariables(template.message, selectedClient);
        setNewMessage(prev => prev.replace(/@([a-zA-Z]*)$/, resolvedMessage));
        setShowAutocomplete(false);
        setTemplateQuery("");
    };
    
    // Handle template autocomplete selection in messaging UI
    const handleTemplateAutocompleteSelect = (template) => {
        if (!selectedClient) return;
        
        const beforeCursor = newMessage.substring(0, messageCursorPosition);
        const afterCursor = newMessage.substring(messageCursorPosition);
        
        // Find the start of the @ template being typed
        const beforeMatch = beforeCursor.match(/@([a-zA-Z0-9_]*)$/);
        if (beforeMatch) {
            const startPos = beforeCursor.lastIndexOf('@');
            const resolvedMessage = resolveTemplateVariables(template.message, selectedClient);
            const newValue = newMessage.substring(0, startPos) + resolvedMessage + afterCursor;
            
            setNewMessage(newValue);
            
            // Set cursor position after the inserted template
            const newCursorPos = startPos + resolvedMessage.length;
            setTimeout(() => {
                const textarea = document.querySelector('textarea[placeholder="Type your message..."]');
                if (textarea) {
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                    textarea.focus();
                }
            }, 0);
        }
        
        setShowTemplateAutocomplete(false);
        setTemplateAutocompleteQuery("");
    };
    
    // Move these functions to the top level
    const addTemplate = async () => {
        const newTemplates = [
            ...templates,
            { id: Date.now().toString(), name: 'New Template', message: '' }
        ];
        await globalConfig.setAsync('templates', newTemplates);
    };
    const deleteTemplate = async (templateId) => {
        const newTemplates = templates.filter(t => t.id !== templateId);
        await globalConfig.setAsync('templates', newTemplates);
        setEditingId(null);
    };
    const saveEdit = async (templateId) => {
        const newTemplates = templates.map(t =>
            t.id === templateId ? { ...t, name: newName, message: newMessageEdit } : t
        );
        await globalConfig.setAsync('templates', newTemplates);
        setEditingId(null);
    };
    
    // Debug info for templates table
    const allTableNames = base ? base.tables.map(t => t.name) : [];
    
    // Template Editor UI
    if (editTemplates) {
        // Editor view
        if (editingId) {
            const template = templates.find(t => t.id === editingId);
            if (!template) return null;
            return (
                <div style={{ padding: 24 }}>
                    <button className="mb-4 text-blue-600 hover:underline" onClick={() => setEditingId(null)}>&larr; Back to list</button>
                    {allowDebugging && (
                        <div className="mb-4 p-2 bg-gray-100 rounded text-xs text-gray-700">
                            <div><b>Templates in globalConfig:</b> {templates.length}</div>
                            <div><b>Available Fields:</b> {availableFields.map(f => `${f.name} (@${normalizeFieldName(f.name)})`).join(', ')}</div>
                            <div><b>Selected Client:</b> {selectedClient ? `${selectedClient.getCellValue('Name') || selectedClient.getCellValue('First Name') || 'Unknown'} (${selectedClient.id})` : 'None'}</div>
                            <div><b>Variable Autocomplete:</b> {showVariableAutocomplete ? `Active (query: "${variableAutocompleteQuery}", matches: ${filteredAutocompleteFields.length})` : 'Inactive'}</div>
                            <div><b>Template Autocomplete:</b> {showTemplateAutocomplete ? `Active (query: "${templateAutocompleteQuery}", matches: ${filteredTemplateAutocomplete.length})` : 'Inactive'}</div>
                            <div><b>Raw Templates:</b> <pre>{JSON.stringify(templates, null, 2)}</pre></div>
                        </div>
                    )}
                    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, position: 'relative', maxWidth: 500 }}>
                        <label className="block font-medium mb-1">Template Name</label>
                        <input
                            className="w-full border rounded p-2 mb-2"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                        />
                        <label className="block font-medium mb-1">Message</label>
                        <div className="relative">
                            <textarea
                                className="w-full border rounded p-2"
                                value={newMessageEdit}
                                onChange={handleTemplateEditorInput}
                                onKeyDown={(e) => {
                                    // Handle variable autocomplete
                                    if (showVariableAutocomplete && filteredAutocompleteFields.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                                        e.preventDefault();
                                        handleVariableAutocompleteSelect(filteredAutocompleteFields[0]);
                                    }
                                    if (e.key === 'Escape') {
                                        setShowVariableAutocomplete(false);
                                        setVariableAutocompleteQuery("");
                                    }
                                    
                                    // Handle variable picker (legacy)
                                    if (showVariablePicker && filteredFields.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                                        e.preventDefault();
                                        const selectedField = filteredFields[0];
                                        setNewMessageEdit(prev => prev + `@${normalizeFieldName(selectedField.name)}`);
                                        setShowVariablePicker(false);
                                        setVariableQuery("");
                                    }
                                    if (e.key === 'Escape') {
                                        setShowVariablePicker(false);
                                        setVariableQuery("");
                                    }
                                }}
                                onBlur={() => {
                                    // Delay hiding autocomplete to allow for clicks on dropdown items
                                    setTimeout(() => {
                                        setShowVariableAutocomplete(false);
                                        setVariableAutocompleteQuery("");
                                    }, 150);
                                }}
                            />
                            <div className="absolute top-2 right-2">
                                <button
                                    type="button"
                                    onClick={() => setShowVariablePicker(!showVariablePicker)}
                                    className="text-gray-500 hover:text-gray-700 p-1 rounded-md focus:outline-none text-sm font-bold"
                                    title="Insert variable"
                                >
                                    @
                                </button>
                            </div>
                            {showVariablePicker && (
                                <div className="absolute left-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[200px] max-h-48 overflow-y-auto">
                                    <div className="p-2 border-b">
                                        <input
                                            type="text"
                                            placeholder="Search fields..."
                                            value={variableQuery}
                                            onChange={(e) => setVariableQuery(e.target.value)}
                                            className="w-full p-1 text-sm border rounded"
                                            autoFocus
                                        />
                                    </div>
                                    {filteredFields.length === 0 ? (
                                        <div className="p-2 text-sm text-gray-500">No fields found</div>
                                    ) : (
                                        filteredFields.map((field) => (
                                            <button
                                                key={field.id}
                                                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                                                onMouseDown={() => {
                                                    setNewMessageEdit(prev => prev + `@${normalizeFieldName(field.name)}`);
                                                    setShowVariablePicker(false);
                                                    setVariableQuery("");
                                                }}
                                            >
                                                <div className="font-medium">{field.name}</div>
                                                <div className="text-xs text-gray-500">
                                                    {field.type} • Use: @{normalizeFieldName(field.name)}
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                            {showVariableAutocomplete && filteredAutocompleteFields.length > 0 && (
                                <div className="absolute left-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[250px] max-h-48 overflow-y-auto">
                                    <div className="p-2 border-b bg-gray-50">
                                        <div className="text-xs text-gray-600">Available variables:</div>
                                    </div>
                                    {filteredAutocompleteFields.map((field) => (
                                        <button
                                            key={field.id}
                                            className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                                            onMouseDown={() => handleVariableAutocompleteSelect(field)}
                                        >
                                            <div className="font-medium">{field.name}</div>
                                            <div className="text-xs text-gray-500">
                                                {field.type} • @{normalizeFieldName(field.name)}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="mt-2 text-xs text-gray-600">
                            Type @ to see available variables. Continue typing to filter the list. Use @ followed by a normalized field name to insert dynamic variables (e.g., @FirstName, @Phone)
                            {availableFields.length > 0 && (
                                <div className="mt-1">
                                    <strong>Available fields:</strong> {availableFields.map(f => `${f.name} → @${normalizeFieldName(f.name)}`).join(', ')}
                                </div>
                            )}
                        </div>
                        <div className="flex space-x-2 mt-4">
                            <button
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                onClick={() => saveEdit(template.id)}
                            >
                                Save
                            </button>
                            <button
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                                onClick={() => setEditingId(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-4 py-2 text-red-500 border border-red-300 rounded hover:bg-red-50 ml-auto"
                                onClick={() => deleteTemplate(template.id)}
                                title="Delete Template"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        // List view
        return (
            <div style={{ padding: 24, maxWidth: 500 }}>
                {allowDebugging && (
                    <div className="mb-4 p-2 bg-gray-100 rounded text-xs text-gray-700">
                        <div><b>Templates in globalConfig:</b> {templates.length}</div>
                        <div><b>Raw Templates:</b> <pre>{JSON.stringify(templates, null, 2)}</pre></div>
                    </div>
                )}
                <h2 className="text-xl font-bold mb-4">Edit Templates</h2>
                {templates.length === 0 && (
                    <div className="mb-4 text-red-600 text-sm">No templates found. Add a template to get started.</div>
                )}
                <ul className="mb-6">
                    {templates.map((template) => (
                        <li key={template.id} className="border-b py-3">
                            <div className="flex items-center justify-between mb-1">
                                <button className="text-blue-700 hover:underline text-left flex-1" onClick={() => {
                                    setEditingId(template.id);
                                    setNewName(template.name);
                                    setNewMessageEdit(template.message);
                                }}>
                                    {template.name || <span className="italic text-gray-400">(Untitled)</span>}
                                </button>
                                <button className="ml-2 text-red-500 hover:text-red-700" onClick={() => deleteTemplate(template.id)} title="Delete Template">✕</button>
                            </div>
                            <div className="text-sm text-gray-600 mb-1">
                                <strong>Template:</strong> {template.message || <span className="italic text-gray-400">(No message)</span>}
                            </div>
                            {selectedClient && template.message && (
                                <div className="text-sm text-green-600">
                                    <strong>Preview:</strong> {resolveTemplateVariables(template.message, selectedClient)}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
                <button
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    onClick={async () => {
                        const newId = Date.now().toString();
                        const newTemplates = [
                            ...templates,
                            { id: newId, name: '', message: '' }
                        ];
                        await globalConfig.setAsync('templates', newTemplates);
                        setEditingId(newId);
                        setNewName('');
                        setNewMessageEdit('');
                    }}
                >
                    Add Template
                </button>
            </div>
        );
    }
    
    if (!clientsTable) {
        return (
            <div className="p-6 text-center">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">No Clients Table Found</h2>
                <p className="text-gray-600">Please make sure you have a table named "Clients" in your base.</p>
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
                                    // Handle new template autocomplete
                                    if (showTemplateAutocomplete && filteredTemplateAutocomplete.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                                        e.preventDefault();
                                        handleTemplateAutocompleteSelect(filteredTemplateAutocomplete[0]);
                                    }
                                    if (e.key === 'Escape') {
                                        setShowTemplateAutocomplete(false);
                                        setTemplateAutocompleteQuery("");
                                    }
                                    
                                    // Handle old autocomplete (legacy)
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
                                onBlur={() => { 
                                    setShowTemplatePicker(false); 
                                    setShowAutocomplete(false);
                                    // Delay hiding template autocomplete to allow for clicks on dropdown items
                                    setTimeout(() => {
                                        setShowTemplateAutocomplete(false);
                                        setTemplateAutocompleteQuery("");
                                    }, 150);
                                }}
                            />
                            {showTemplateAutocomplete && filteredTemplateAutocomplete.length > 0 && (
                                <div className="absolute left-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[350px] max-h-64 overflow-y-auto">
                                    <div className="p-2 border-b bg-gray-50">
                                        <div className="text-xs text-gray-600">Available templates:</div>
                                    </div>
                                    {filteredTemplateAutocomplete.map((template) => (
                                        <button
                                            key={template.id}
                                            className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                                            onMouseDown={() => handleTemplateAutocompleteSelect(template)}
                                        >
                                            <div className="font-medium">{template.name || <span className="italic text-gray-400">(Untitled)</span>}</div>
                                            {selectedClient && template.message && (
                                                <div className="text-xs text-gray-600 mt-1">
                                                    {resolveTemplateVariables(template.message, selectedClient)}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {showAutocomplete && filteredTemplates.length > 0 && (
                                <div className="absolute left-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[300px]">
                                    {filteredTemplates.map((record) => (
                                        <button
                                            key={record.id}
                                            className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                                            onMouseDown={() => handleTemplateSelect(record)}
                                        >
                                            <div className="font-medium">{record.name}</div>
                                            {selectedClient && record.message && (
                                                <div className="text-xs text-gray-600 mt-1">
                                                    {resolveTemplateVariables(record.message, selectedClient)}
                                                </div>
                                            )}
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
                                onClick={() => {
                                    setShowTemplatePicker((v) => !v);
                                    // Also show autocomplete when @ button is clicked
                                    if (!showTemplateAutocomplete) {
                                        setShowTemplateAutocomplete(true);
                                        setTemplateAutocompleteQuery("");
                                    }
                                }}
                                className="text-gray-500 hover:text-gray-700 p-1 rounded-md focus:outline-none text-lg font-bold"
                                title="Insert template"
                            >
                                @
                            </button>
                            {showTemplatePicker && !showTemplateAutocomplete && (
                                <div className="absolute left-0 mt-2 bg-white border border-gray-300 rounded shadow-lg z-30 min-w-[350px] max-h-64 overflow-y-auto">
                                    <div className="p-2 border-b bg-gray-50">
                                        <div className="text-xs text-gray-600">Quick templates:</div>
                                    </div>
                                    {templates.length === 0 ? (
                                        <div className="p-4 text-sm text-gray-500 text-center">
                                            No templates found. Create templates in the template editor.
                                        </div>
                                    ) : (
                                        templates.map((template) => (
                                            <button
                                                key={template.id}
                                                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                                                onClick={() => {
                                                    if (selectedClient) {
                                                        const resolvedMessage = resolveTemplateVariables(template.message, selectedClient);
                                                        setNewMessage(prev => prev + resolvedMessage);
                                                    }
                                                    setShowTemplatePicker(false);
                                                }}
                                            >
                                                <div className="font-medium">{template.name || <span className="italic text-gray-400">(Untitled)</span>}</div>
                                                {selectedClient && template.message && (
                                                    <div className="text-xs text-gray-600 mt-1">
                                                        {resolveTemplateVariables(template.message, selectedClient)}
                                                    </div>
                                                )}
                                            </button>
                                        ))
                                    )}
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
