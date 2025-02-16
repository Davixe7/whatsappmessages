const express = require('express');
const router  = express.Router();
const { query, validationResult } = require('express-validator');

const validations = {
  setWebHook: [
    query(['instance_id', 'webhook_url']).notEmpty()
  ],
  getQrCode: [
    query('instance_id').notEmpty()
  ],
  pairingCode: [
    query('phone').notEmpty()
  ],
  send: [
    query(['instance_id', 'number', 'message']).notEmpty(),
    query('number').custom((value, {req})=>{
      if ((value != 'null') && value != '57') { return true }
      throw new Error(`Invalid phone number ${value}`);
    })
  ],
  validate: [
    query(['instance_id', 'phone']).notEmpty()
  ]
}

const { MessageMedia } = require('whatsapp-web.js')

module.exports = (app, io)=>{
  const ClientManager = require('./service')
  const clientManager = new ClientManager(io)

  router.get('/pairing_code', validations.pairingCode, (req, res) => {
    let errors = validationResult(req)
    if( !errors.isEmpty() ){
      return res.status(422).send({ errors: errors.array() });
    }

    let newClient = clientManager.getPairingCode(req.query.phone)
    return res.send({ name: 'yiye', instance_id: newClient.clientId, pairingCode: newClient.pairingCode.code })
  })

  router.get('/create_instance', async (req, res) => {
    let newClient = clientManager.getAvailableInstance()
    res.send({ instance_id: newClient.clientId })
  })
  
  router.get('/set_webhook', validations.setWebHook, (req, res) => {
    //No available client
    if (!clientManager.availableClient.clientId || clientManager.availableClient.authenticated){
      return res.status(422).send({ message: 'Instance ID invalidated' });
    }

    //No available client
    if (req.query.instance_id != clientManager.availableClient.clientId) {
      return res.status(422).send({ message: 'Instance ID invalidated' });
    }
  
    clientManager.availableClient.webhook_url = req.query.webhook_url
    return res.send({ message: 'Webhook set successfully', status: 'success' })
  })
  
  router.get('/get_qrcode', validations.getQrCode, (req, res) => {
    if (clientManager.availableClient.authenticated ) {
      res.send('instance ID invalidated')
      return;
    }
if( clientManager.availableClient.clientId != req.query.instance_id ){
res.send('Instance ID Does not match');
return;
}
  
    res.send({ base64: clientManager.availableClient.qr.url, status: 'success' })
  })
  
  router.get('/send', validations.send, async (req, res) => {
    let client  = await clientManager.findClient(req.query.instance_id)
    if (!client) { res.status(404).send({ status: 'error', message: 'Instance id not found or invalidated' }); return; }
  
    let media   = req.query.media_url ? await MessageMedia.fromUrl(req.query.media_url, {"unsafeMime": true}) : null
    let options = media ? { media, caption: req.query.message } : {}
    let number  = req.query.group_id ? `${req.query.group_id}@g.us`: `${req.query.number}@c.us`
  
    if (client.info) {
      console.log(req.query.instance_id + ' Sending message ready ' + number)
      client.sendMessage(number, req.query.message, options)
    }
    else {
      console.log(req.query.instance_id + ' Sending message deferred ' + number)
      client.once('ready', () => client.sendMessage(number, req.query.message, options))
    }
  
    return res.send({ message: 'Message sent successfully' })
  })

  router.get('/validate', validations.validate, async(req, res) => {
    let isOnline = await clientManager.isClientOnline(req.query.instance_id, req.query.phone)
    res.send({message: isOnline ? 'Client is active and running' : 'Client is not responding', data: isOnline ? 1 : 0})
  })

  router.get('/find', async (req, res) => {
    let client = await clientManager.findClient(req.query.instance_id);
  
    if (!client) {
      return res.send({message: 'Session does not exist.'})
    }
  
    if (client.info) {
      return res.send({status: 'success', message: 'Client found in memory', info: client.info, state: client.status})
    }
  
    return res.send({status: 'success', message: 'Client found in DB', info: 'Not available until ready'})
  })

router.get('/instances', (req, res)=>{
if( Object.keys(clientManager.clients).length > 0 ){
	let instances = [];
	instances = Object.values(clientManager.clients).map(i => {
		console.log('client_id: ' + i.clientId)
		return {
			authenticated: i.authenticated,
			clientId: i.clientId,
			phone: i.phone
		}
	})
	res.send({instances});
}
res.send([]);
});

  router.get('/logout', async (req, res) => {
    let message = await clientManager.logout(req.query.instance_id)
    res.send({ status: 'success', message })
  })

  app.use('/', router)
};
