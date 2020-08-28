var inquirer = require('inquirer');
var fs = require('fs');
var crypto = require('crypto');
var openpgp = require('openpgp');
var WebSocket = require('ws');

const isIP = str => (/^(?:https?\:\/\/)?(?:\d\.?){3}\d(?:\:\d+)?\/?$/).test(str);
const extract = str => str.match(/(?<=\s)[A-z\+\/=]+/)?.[0];
function getChunks(number, size) {
  let string = number.toString(),
      length = string.length - size + 1;
      
  return Array.from({ length }, (_,i) => +string.slice(i, i + size))
}

async function configConnection() {
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

async function config() {
  let data;
  let retry;
  do {
    retry = false;
    data = await inquirer.prompt([
      {
        type: 'number',
        message: '\n[1]: Connect to server\n[2]: Generate new ECC key pair and save to config\n[3]: Nuke existing key pairs\n',
        name: 'configChoice'
      },
      {
        type: 'confirm',
        message: 'Proceed with choice? (Default: n):',
        name: 'confirmation'
      }
    ]);
    if (!data.confirmation) {
      ({ retry } = (await inquirer.prompt([{
        type: 'confirm',
        name: 'retry',
        message: 'Re-enter choice? (Default: y)',
        default: true
      }])));
      if (!retry) {
        process.exit(0);
      }
    }
  } while (retry);
  return data;
}

async function connectionEvents(ws) {
  ws.on('open', function open() {
    console.clear(); console.log(`[!]: Connection established with ${data.server}`);
  });
   
  ws.on('message', function incoming(data) {
    let parsedData;
    try {
      parsedData = JSON.parse(data);
      if (parsedData.type) {
        switch (parsedData.type) {
          case "messageRelay": {
            
          }
        }
      } else {
        console.error('[!]: Received message from server but it did not contain the type');
      }
    } catch(err) {
      console.error('[!]: Received message from server but could not parse the data');
    }
  });
}


async function connectServer() {
  let data = await configConnection();
  let ws;
  console.clear(); console.log("Attempting to connect to server...");
  if (isIP(data.server)) {
    ws = new WebSocket(`http://${data.server}:${data.serverPort}/`);
  } else {
    ws = new WebSocket(data.server);
  }
  connectionEvents(ws);
}

async function generateKeys() {
  let hash = crypto.createHash('sha1');
  let { modulusLength } = await inquirer.prompt([{
    type: 'number',
    message: 'Enter RSA key size:',
    name: 'modulusLength'
  }]);
  const [ err, publicKey, privateKey ] = await (new Promise(resolve => {
    crypto.generateKeyPair(
      'rsa',
      { modulusLength },
      (...args) => resolve(args)
    );
  }));
  if (err) {
    console.log('Failed to generate key pair');
    console.error(err);
  }
  try {
    await fs.promises.writeFile(
      'key',
      privateKey.export({ type: 'pkcs8', format: 'pem' })
    );
    await fs.promises.writeFile(
      'key.pub',
      publicKey.export({ type: 'spki', format: 'pem' })
    );
    await fs.promises.writeFile(
      'fingerprint',
      [ ...hash.update(publicKey.export({
        type: 'spki',
        format: 'der'
      })).digest() ].map(v => v.toString(16).padStart(2, '0')).join(':')
    );
  }
  catch (err) {
    console.log('Could not save file(s).');
    console.error(err);
  }
  return [ publicKey, privateKey ];
}

async function main() {
  let retry;
  do {
    let data = await config();
    retry = false;
    switch (data.configChoice) {
      case 1: console.clear(); connectServer(); break;
      case 2: console.clear(); generateKeys(); break;
      case 3: console.clear(); console.log("Not available"); retry = true; break;
      default: console.clear(); console.log("Invalid input"); retry = true; break;
    }
  } while (retry);
}

main();