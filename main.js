var inquirer = require('inquirer');
var fs = require('fs');
var crypto = require('crypto');
var openpgp = require('openpgp');
var WebSocket = require('ws');

var eventBase = require('./modules/eventBase');
const e = require('express');

const isDomain = str => (/^(?:https?\:\/\/)?(?:(?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,6}\/?$/).test(str);
const extract = str => str.match(/(?<=\s)[A-z\+\/=]+/)?.[0];

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
        message: 'Enter server public key fingerprint:',
        name: 'serverFingerprint'
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

async function serverValidation(ws, configData) { 
  console.clear(); console.log(`[!]: Connection established with ${configData.server}`);
  if (configData.serverFingerprint) {
    await ws.send(JSON.stringify({type: "REQUEST_SERVER_KEY"}));
    let { key } = JSON.parse(await require('events').once(eventBase, 'RETURN_SERVER_KEY'));
    let fingerprint = crypto.createHash('sha1').update(extract(key)).digest().map(v => v.toString(16).padStart(2, '0')).join(':');
    if (configData.serverFingerprint == fingerprint) {
      console.log(`[!]: Fingerprints match, proceeding to verify that the server is the key holder`);
      let nonce = crypto.randomBytes(16).toString('hex');
      await ws.send(JSON.stringify({type: "REQUEST_SERVER_AUTHENTICATION", nonce: await crypto.publicEncrypt(key, Buffer.from(nonce))}));
      let { returnedNonce } = JSON.parse(await require('events').once(eventBase, 'RETURN_SERVER_AUTHENTICATION'));
      if (returnedNonce == nonce) {
        return true;
      } else {
        console.error(`[!]: Server authentication failed, server returned invalid nonce. Terminating.`); ws.terminate();
      }
    }
  } else {
    console.error(`[!]: No server public key fingerprint provided, not checking server authenticity. This is not very secure.`)
  }
}

/*
async function serverValidation(ws, configData) { 
  console.clear(); console.log(`[!]: Connection established with ${configData.server}`);
  if (configData.serverFingerprint) {
    ws.send(JSON.stringify({type: "requestServerPublicKey"}));
    let e1 = ws.on('message', function incoming(data) {
      let parsedData;
      try { parsedData = JSON.parse(data); } catch { console.error("[!]: Received nonsensical data from server while expecting response to authentication request. Terminating."); ws.terminate(); };
      if (parsedData.type && parsedData.type == "returnServerPublicKey") {
        let expectedFingerprint = configData.serverFingerprint;
        let receivedFingerprint = crypto.createHash('sha1').update(extract(parsedData.key)).digest().map(v => v.toString(16).padStart(2, '0')).join(':');
        if (expectedFingerprint == receivedFingerprint) {
          let nonce = crypto.randomBytes(16);
          let encryptedNonce = crypto.publicEncrypt(parsedData.key, Buffer.from(nonce));
          ws.send(JSON.stringify(
            {
              type: "requestServerAuthentication",
              encryptedNonce: encryptedNonce
            }
          ));
          let e2 = ws.on('message', function incoming(data2) {
            try { parsedData2 = JSON.parse(data2); } catch { console.error("[!]: Received nonsensical data from server while expecting response to authentication request. Terminating."); ws.terminate(); };
            if (parsedData2.type && parsedData2.type == "returnServerAuthentication") {
              if (parsedData2.decryptedNonce == nonce) {
                // uhhh
              } else {
                console.error("[!]: Server returned incorrect decrypted nonce. This likely means that the server IP/domain has been hijacked. Terminating."); ws.terminate();
              }
            } {
              console.error("[!]: Received JSON data from server, but it either did not return the nonce or there was no data type provided. Terminating."); ws.terminate();
            }
          });
        } {
          console.error(`[!]: Fingerprints mismatch\nExpected: ${expectedFingerprint}\nReceived: ${receivedFingerprint}\nTerminating connection.`); ws.terminate();
        }
      } else {
        console.error("[!]: Received JSON data from server, but it either did not return the public key or there was no data type provided. Terminating."); ws.terminate();
      }
    });
  } else {
    console.error(`[!]: No server public key fingerprint provided, not checking server authenticity. This is not very secure.`)
  }
}
*/

async function connectionEvents(ws, configData) {
  let serverAuthenticated = false;
  ws.on('open', function open() {
    console.clear(); console.log(`[!]: Connection established with ${configData.server}`);
    if (configData.serverFingerprint) {
      serverAuthenticated = serverValidation(ws, configData);
    } else {
      console.error(`[!]: No server public key fingerprint provided, not checking server authenticity. This is not very secure.`)
    }
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
    } catch (err) {
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
  eventBase.init(ws); connectionEvents(ws, data);
}

async function generateKeys() {
  let hash = crypto.createHash('sha1');
  let { modulusLength } = await inquirer.prompt([{
    type: 'number',
    message: 'Enter RSA key size:',
    name: 'modulusLength'
  }]);
  const [err, publicKey, privateKey] = await (new Promise(resolve => {
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
      [...hash.update(publicKey.export({
        type: 'spki',
        format: 'der'
      })).digest()].map(v => v.toString(16).padStart(2, '0')).join(':')
    );
  }
  catch (err) {
    console.log('Could not save file(s).');
    console.error(err);
  }
  return [publicKey, privateKey];
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