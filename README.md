# SMS Chat Interface Extension

An Airtable Interface Extension that provides a chat interface for SMS communications with clients using the OpenPhone API.

## Features

- Real-time SMS chat interface
- Client selection from Airtable records
- Message history and status tracking
- Template messages with autocomplete
- Emoji picker
- Debug panel for troubleshooting
- API key management

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure API credentials:**
   - Get your OpenPhone API key and Phone Number ID
   - Configure them in the extension settings

3. **Development:**
   ```bash
   # Start local development server
   npx @airtable/blocks-cli dev
   ```

4. **Deploy:**
   ```bash
   # Release to Airtable
   npx @airtable/blocks-cli block release
   ```

## Requirements

- Airtable base with a "Clients" table
- OpenPhone API credentials
- Phone number field in the Clients table

## Development

This extension uses:
- React 19
- Tailwind CSS for styling
- Airtable Blocks SDK
- OpenPhone API integration

## License

MIT License - see LICENSE.md for details 