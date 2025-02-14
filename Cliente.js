const { Client, LocalAuth } = require('whatsapp-web.js')
const qrcode         = require('qrcode')
const EventEmitter   = require('events').EventEmitter;
const { v4: uuidv4 } = require('uuid')

class Cliente extends EventEmitter {

    constructor(clientId = null, phone = null){
        super()
        this.authenticated = false
        this.clientId      = clientId ? clientId : uuidv4().split('-').pop()
        this.phone         = phone
        this.instance      = new Client({
				authStrategy: new LocalAuth({clientId: this.clientId}),
				puppeteer: {
					headless: true,
					args: ['headless', '--no-sandbox', '--disable-setuid-sandbox']
				}})

        this.webhook_url   = null
        this.pairingCode   = {updatedAt: new Date(), code: null}
        this.qr            = {updatedAt: new Date(), url: null}
    }

    isExpired(){
        let now             = new Date()
        let elapsedTimeMins = (now - this.qr.updatedAt) / (1000 * 60)
        return elapsedTimeMins > 1.5
    }

    setDefaultListeners(){
        this.instance.on('qr', async(qr) => {
            console.log(this.clientId, ' WWebInstance: QR code received')

            if( this.phone && this.pairingCode.code){
                console.log('Pairingcode already')
                return; 
            }

            if( this.phone && !this.pairingCode.code){
                console.log('Requesting pairingcode')
                this.pairingCode.code      = await this.instance.requestPairingCode(this.phone, true)
                console.log('WWebInstance: Pairing code received')
                this.pairingCode.updatedAt = new Date()
                this.emit('pairingCode', this.pairingCode.code)
                return;
            }

            this.qr.updatedAt = new Date()
            this.qr.url       = await qrcode.toDataURL(qr)
            this.emit('qr', this.qr.url)
        })

        this.instance.on('ready', () => {
            this.authenticated = true
            this.emit('ready', this.clientId)
        })
    }

    initialize(){
        this.instance.initialize()
    }
}

module.exports = Cliente
