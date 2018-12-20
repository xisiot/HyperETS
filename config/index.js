module.exports = {
  channel: {
    name: 'mychannel',
    order: 'grpc://localhost:7050',
  },

  envAgency: {
    ca: {
      host: 'http://localhost:7054',
      name: 'agency-ca.example.com',
    },
    mspid: 'AgencyMSP',
    peers: ['grpc://localhost:7051'],
    eventHub: 'grpc://localhost:7053',
  },

  tradingCenter: {
    ca: {
      host: 'http://localhost:8054',
      name: 'center-ca.example.com',
    },
    mspid: 'CenterMSP',
    peers: [ 'grpc://localhost:8051'],
    eventHub: 'grpc://localhost:8053',
  },
}