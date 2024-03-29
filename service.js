const mongoose               = require('mongoose')
const { MongoStore }         = require('wwebjs-mongo')
const store                  = new MongoStore(mongoose)
const { Client, LocalAuth }  = require('whatsapp-web.js')
const qrcode                 = require('qrcode')
const { v4: uuidv4 }         = require('uuid')
const fs = require("fs")

class ClientManager {
  constructor() {
    this.clients = {};
    this.availableClient = {}
    mongoose.connect('mongodb://localhost/wweb')
  }

  createClient() {
    let clientId     = uuidv4().split('-').pop()
    let authStrategy = new LocalAuth({clientId})
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
        console.log(this.availableClient.id + ' qr updated')
        this.availableClient.qr = url;
      });
    });

    client.on('ready', () => {
      console.log('Client ready!');
      this.clients[client.options.authStrategy.clientId] = client;
      console.log('Client info');
      console.log(client.info);

      if (this.availableClient.id != client.options.authStrategy.clientId) { return; }
      this.availableClient.authenticated = true;

	if( this.availableClient.webhook_url ){
		axios.get(this.availableClient.webhook_url, {
		  params: {
		    event: 'ready',
		    instance_id: this.availableClient.id,
		    phone: this.availableClient.client.info.wid.user
		  }
		})
		.then(res => console.log('Webhook set successfully'))
		.catch(err => { console.log(err); console.log(err.response) })
	}
    });
  }

  restoreClient(clientId) {
    let authStrategy = new LocalAuth({clientId})
    let client = new Client({ authStrategy })
    client.on('ready', ()=>{
        console.log('Client restored succesfully')
    })
    client.on('authentication_failure', () => {
        console.log('Authentication failed')
    })
    client.on('qr', ()=>{
        console.log(clientId, ' qr received')
        client.getState().then(res=>console.log(res))
    })
    console.log( client.status )
    console.log( client.WAState )
    client.initialize()
    this.clients[clientId] = client;
    return client;
  }

  async findClient(instance_id) {
    // let exists = await store.sessionExists({ session: `RemoteAuth-${instance_id}` });
    let exists = fs.existsSync(`./.wwebjs_auth/session-${instance_id}`)
    if (!exists && !this.clients.hasOwnProperty(instance_id)) return null;

    if (this.clients.hasOwnProperty(instance_id)) {
      return this.clients[instance_id];
    }

    return this.restoreClient(instance_id);
  }

  async deleteClient(client, instance_id){
    await client.logout()
    await store.delete({ session: instance_id });
    delete this.clients[instance_id];
    console.log(instance_id + 'Session closed ')
  }

  async logout(instance_id){
    let client = await this.findClient(instance_id)
    console.log( instance_id + ' requested logout' );
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
