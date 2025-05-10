import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

import qrcode from 'qrcode-terminal';
const client = new Client({
    authStrategy: new LocalAuth(),
});

client.on('qr', (qr) => {
    console.log('Scan the QR code below:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');

    const recipient = '12345678'; // Replace with actual number (e.g. +628xxxxxxxxx)
    const message = 'Hello, this is a test message!';

    client.sendMessage(`${recipient}@c.us`, message)
        .then(response => console.log('Message sent successfully:', response))
        .catch(err => console.error('Error sending message:', err));
});

client.on('error', (err) => {
    console.error('Error:', err);
});

client.initialize();
