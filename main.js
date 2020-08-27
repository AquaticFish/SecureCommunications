var app = require('express')();
var https = require('https').createServer(app);
var inquirer = require('inquirer');
var fs = require('fs');
var io = require('socket.io-client');
var crypto = require('crypto');

async function config() {
  let data;
  let retry;
  do {
      retry = false;
      data = await inquirer.prompt([
    {
      type: 'input',
      message: 'Enter server IP or domain:',
      name: 'server',
    },
    {
      type: 'number',
      message: 'Enter server port (Default: 62233):',
      name: 'serverPort',
      default: 62233
    },
    {
      type: 'input',
      message: 'Enter server public key:',
      name: 'serverPublicKey'
    },
    {
      type: 'input',
      message: 'Enter your public key:',
      name: 'clientPublicKey'
    },
    {
      type: 'input',
      message: 'Enter username to connect with:',
      name: 'username',
    },
    {
      type: 'password',
      message: 'Enter password to connect with:',
      name: 'password',
    },
    {
      type: 'confirm',
      name: 'confirmation',
      message: 'Proceed to establish connection with server? (Default: n):',
      default: false,
    },
  ]);
  if (!data.confirmation) {
    ({ retry } = (await inquirer.prompt([{
        type: 'confirm',
        name: 'retry',
        message: 'Re-enter details? (Default: y)',
        default: true
    }])));
    if (!retry) {
        process.exit(0);
    }
}
} while (retry);
return data;
}

async function main() {
let data = await config();
var socket = io(`${data.server}:${data.serverPort}`);
socket.on('connect_error', () => { process.exit(0); });
socket.on('connect', () => {
  console.log(`Connection established with ${data.server}:${data.serverPort}.`);
  console.log(`Verifying server identity.`);
  let randomVerificationNumber = crypto.randomBytes(64);
});


}

main();


/*app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  console.log('a user connected');
});

http.listen(3000, () => {
  console.log('listening on *:3000');
});*/