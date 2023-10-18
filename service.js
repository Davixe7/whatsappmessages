const mongoose               = require('mongoose')
const { MongoStore }         = require('wwebjs-mongo')
const store                  = new MongoStore(mongoose)
const { Client, RemoteAuth } = require('whatsapp-web.js')
const qrcode                 = require('qrcode')
const { v4: uuidv4 }         = require('uuid')

class ClientManager {
  constructor() {
    this.clients = {};
    this.availableClient = {}
    mongoose.connect('mongodb://localhost/wweb')
  }

  createClient() {
    let clientId     = uuidv4().split('-').pop()
    let authStrategy = new RemoteAuth({store, clientId, backupSyncIntervalMs: 300000})
    let client = new Client({authStrategy});

    this.availableClient.authenticated = false
    this.availableClient.client        = client
    this.availableClient.id            = clientId

    console.log('Client created ' + this.availableClient.id);

    this.setClientDefaultListeners(client);

    client.initialize();
    console.log('Initializing client');
    return client;
  }

  setClientDefaultListeners(client) {
    console.log('Setting client default listeners');

    client.on('qr', (qrcontent) => {
      qrcode.toDataURL(qrcontent, (err, url) => {
        this.availableClient.qr = url;
      });
    });

    client.on('ready', () => {
      console.log('Client ready!');
      if (client.options.authStrategy.clientId == this.availableClient.id) {
        this.availableClient.authenticated = true;
      }
      this.clients[client.options.authStrategy.clientId] = client;
      console.log('Client info');
      console.log(client.info);
    });
  }

  restoreClient(clientId) {
    let authStrategy = new RemoteAuth({ store, clientId, backupSyncIntervalMs: 300000 })
    let client = new Client({ authStrategy })
    client.on('ready', ()=>{
        console.log('Client restored succesfully')
    })
    client.on('authentication_failure', () => {
        console.log('Authentication failed')
    })
    client.on('qr', ()=>{
        console.log('qr received')
        client.getState().then(res=>console.log(res))
    })
    console.log( client.status )
    console.log( client.WAState )
    client.initialize()
    this.clients[clientId] = client;
    return client;
  }

  async findClient(instance_id) {
    let exists = await store.sessionExists({ session: `RemoteAuth-${instance_id}` });
    if (!exists && !this.clients.hasOwnProperty(instance_id)) return null;

    if (this.clients.hasOwnProperty(instance_id)) {
      console.log('Client found in memory');
      return this.clients[instance_id];
    }

    console.log('Client found in DB');
    return this.restoreClient(instance_id);
  }

  async deleteClient(client, instance_id){
    await client.logout()
    await store.delete({ session: instance_id });
    delete this.clients[instance_id];
  }

  async logout(instance_id){
    let client = await this.findClient(instance_id)
    if( !client ){ return 'session already closed.'; }

    if( client.info ){
      this.deleteClient(client, instance_id)
      return 'session closed.'
    }

    client.once('ready', async () => this.deleteClient(client, instance_id))
    return 'session will close soon.'
  }
}

module.exports = ClientManager;
