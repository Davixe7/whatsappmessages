const { Client, LocalAuth }  = require('whatsapp-web.js')
const Cliente                = require('./Cliente')
const fs                     = require("fs")

class ClientManager {
  constructor(io) {
    this.io              = io;
    this.clients         = {};
    this.pairingClients  = {};
    this.availableClient = this.createInstance()
  }

  createInstance(clientId, phone) {
    let newClient = new Cliente(clientId, phone)
    newClient.setDefaultListeners()
    newClient.initialize()
    this.setClientDefaultListeners(newClient)
    return newClient
  }

  getPairingCode(phone){
    if(this.pairingClients.hasOwnProperty(phone)){
      return this.pairingClients[phone]
    }

    let newClient = this.createInstance(null, phone)
    this.pairingClients[phone] = newClient;
    return newClient
  }

  getAvailableInstance(){
    if( !this.availableClient.authenticated && !this.availableClient.isExpired() ){
      return this.availableClient
    }
    this.availableClient = this.createInstance()
    return this.availableClient
  }

  setClientDefaultListeners(client) {

    client.on('qr', async (qrurl) => {
      if(client.clientId != this.availableClient.clientId){return;}
      this.io.emit('qrcode', JSON.stringify({
        qrcode: qrurl,
        instance_id: client.clientId
      }))
    });

    client.on('pairingCode', async (pairingCode) => {
      this.io.emit('pairingCode', JSON.stringify({
        pairingCode,
        instance_id: client.clientId
      }))
    });

    client.on('ready', async () => {
      let params = {
        event: 'ready',
        instance_id: client.clientId,
        phone: client.instance.info.wid.user,
      }

      this.clients[client.clientId] = client;
      this.io.emit('ready', JSON.stringify(params))

      // SetWebHook if specified
      try {
        if( !client.webhook_url ){ return; }
        await axios.get(client.webhook_url, {params})
        console.log('Webhook set successfully')
      } catch(error){
        console.log(err); console.log(err.response)
      }
    });
  }

  restoreClient(clientId) {
    let client = new Client({ authStrategy: new LocalAuth({clientId}) })
    client.once('ready', () => console.log('Client ' + clientId + ' restored succesfully'))
    client.initialize()
    this.clients[clientId] = client;
    return client;
  }

  async findClient(instance_id) {
    let exists = fs.existsSync(`./.wwebjs_auth/session-${instance_id}`)
    if (!exists && !this.clients.hasOwnProperty(instance_id)) return null;

    if (this.clients.hasOwnProperty(instance_id)) {
      return this.clients[instance_id].instance;
    }

    return this.restoreClient(instance_id);
  }

  async deleteClient(client, instance_id){
    await client.logout()
    delete this.clients[instance_id];
    console.log(instance_id + 'Session closed ')
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

  async isClientOnline(instance_id, wid) {
    let client = await this.findClient(instance_id);

    if(!client || !client.info){ return false; }

    try {
      const contact  = await client.getContactById(`${wid}@c.us`);
      const isOnline = (contact.isMe && contact.isUser)
      return isOnline;
    } catch (error) {
      console.error("Error:", error);
      return false;
    }
  }
}

module.exports = ClientManager;
