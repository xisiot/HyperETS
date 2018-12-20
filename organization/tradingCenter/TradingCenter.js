var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');
var Promise = require('bluebird');
var path = require('path')
var util = require('util');
var _ = require('lodash');

const STORE_PATH = path.join(__dirname, 'hfc-key-store');

function TradingCenter(config) {
  var _this = this;
  var fabric_client = new Fabric_Client();
  var channel = fabric_client.newChannel(config.channel.name);
  var peerForEh;

  this.config = config;
  this.fabric_client = fabric_client;
  this.channel = channel;

  //add peers
  config.tradingCenter.peers.forEach(host => {
    let peer = fabric_client.newPeer(host);
    channel.addPeer(peer);
    peerForEh = peer;
  });

  //add order
  var order = fabric_client.newOrderer(config.channel.order);
  channel.addOrderer(order);

  var eventHub = channel.newChannelEventHub(peerForEh);
  this.eventHub = eventHub;
}

/******************* help functions *****************/

var prototype = TradingCenter.prototype;

prototype.query = function (request) {
  var _this = this;
  var tx_id = _this.fabric_client.newTransactionID();

  request = _.assign(request, {
    chaincodeId: 'emission_trade',
    chainId: _this.config.channel.name,
    txId: tx_id,
  });

  return _this.channel.queryByChaincode(request)
    .then((response) => {
      //console.log(response[0].toString());
      if (response && response.length >= 1) {
        if (response[0] instanceof Error) {
          console.log('err: ', response[0].toString());
          return Promise.reject(response[0].toString());
        } else {
          return Promise.resolve(response[0].toString());
        }
      }
    }).catch(err => {
      console.log('catch', err.toString());
      return Promise.reject(err.toString());
    });
};

prototype.invoke = function (request) {
  var _this = this;
  var fabric_client = _this.fabric_client;
  var tx_id = fabric_client.newTransactionID();

  request = _.assign(request, {
    chaincodeId: 'emission_trade',
    chainId: _this.config.channel.name,
    txId: tx_id,
  });

  var payload = {};
  // send the transaction proposal to the peers
  return _this.channel.sendTransactionProposal(request)
    .then((results) => {
      var proposalResponses = results[0];
      //  console.log('%j', proposalResponses[0]);
      var response = proposalResponses[0].response;
      if (response && response.payload) {
        console.log('payload: ', response.payload.toString());
        payload = response.payload.toString();
      }

      var proposal = results[1];
      let isProposalGood = false;
      if (proposalResponses && proposalResponses[0].response &&
        proposalResponses[0].response.status === 200) {
        isProposalGood = true;
        console.log('Transaction proposal was good');
      }

      if (!isProposalGood) {
        if (proposalResponses && proposalResponses[0].response) {
          return Promise.reject(proposalResponses[0].response.message);
        }

        if (proposalResponses[0]) {
          return Promise.reject(proposalResponses[0]);
        }

        return Promise.reject('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
      }

      console.log(util.format(
        'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s"',
        proposalResponses[0].response.status, proposalResponses[0].response.message));

      // build up the request for the orderer to have the transaction committed
      var reqForOrder = {
        proposalResponses: proposalResponses,
        proposal: proposal
      };

      // set the transaction listener and set a timeout of 30 sec
      // if the transaction did not get committed within the timeout period,
      // report a TIMEOUT status
      var tx_id = request.txId;
      var transaction_id_string = tx_id.getTransactionID(); //Get the transaction ID string to be used by the event processing
      var promises = [];

      var sendPromise = _this.channel.sendTransaction(reqForOrder);
      promises.push(sendPromise); //we want the send transaction first, so that we know where to check status

      // get an eventhub once the fabric client has a user assigned. The user
      // is required bacause the event registration must be signed
      let event_hub = this.eventHub;

      // using resolve the promise so that result status may be processed
      // under the then clause rather than having the catch clause process
      // the status
      let txPromise = new Promise((resolve, reject) => {
        let handle = setTimeout(() => {
          //event_hub.disconnect();
          event_hub.unregisterTxEvent(transaction_id_string);
          resolve({ event_status: 'TIMEOUT' }); //we could use reject(new Error('Trnasaction did not complete within 30 seconds'));
        }, 6000);
        event_hub.connect();
        event_hub.registerTxEvent(transaction_id_string, (tx, code) => {
          // this is the callback for transaction event status
          // first some clean up of event listener
          clearTimeout(handle);
          event_hub.unregisterTxEvent(transaction_id_string);
          //event_hub.disconnect();

          // now let the application know what happened
          var return_status = { event_status: code, tx_id: transaction_id_string };
          if (code !== 'VALID') {
            console.error('The transaction was invalid, code = ' + code);
            resolve(return_status); // we could use reject(new Error('Problem with the tranaction, event status ::'+code));
          } else {
            console.log('The transaction has been committed on peer ' + event_hub.getPeerAddr());
            resolve(return_status);
          }
        }, (err) => {
          //this is the callback if something goes wrong with the event registration or processing
          reject(new Error('There was a problem with the eventhub ::' + err));
        });
        event_hub.connect();
      });
      promises.push(txPromise);

      return Promise.all(promises);
    }).then((results) => {
      // check the results in the order the promises were added to the promise all list
      if (results && results[0] && results[0].status === 'SUCCESS') {
        console.log('Successfully sent transaction to the orderer.');
      } else {
        return Promise.reject('Failed to order the transaction. Error code: ' + results[0].status);
      }

      if (results && results[1] && results[1].event_status === 'VALID') {
         return Promise.resolve(payload);
      }

      return Promise.reject('Transaction failed to be committed to the ledger due to ::' + results[1].event_status);
    });
};

/******************* business logic functions *****************/

prototype.enrollAdmin = function () {
  var _this = this;

  var fabric_client = _this.fabric_client;
  var fabric_ca_client = null;
  var admin_user = null;

  console.log(' Store path:' + STORE_PATH);
  // create the key value store as defined in the fabric-client/config/default.json 'key-value-store' setting
  return Fabric_Client.newDefaultKeyValueStore({
    path: STORE_PATH
  }).then((state_store) => {
    // assign the store to the fabric client
    fabric_client.setStateStore(state_store);
    var crypto_suite = Fabric_Client.newCryptoSuite();
    // use the same location for the state store (where the users' certificate are kept)
    // and the crypto store (where the users' keys are kept)
    var crypto_store = Fabric_Client.newCryptoKeyStore({
      path: STORE_PATH
    });

    crypto_suite.setCryptoKeyStore(crypto_store);
    fabric_client.setCryptoSuite(crypto_suite);
    var tlsOptions = {
      trustedRoots: [],
      verify: false
    };
    // be sure to change the http to https when the CA is running TLS enabled
    fabric_ca_client = new Fabric_CA_Client(_this.config.tradingCenter.ca.host, tlsOptions, _this.config.tradingCenter.ca.name, crypto_suite);

    // first check to see if the admin is already enrolled
    return fabric_client.getUserContext('admin', true);
  }).then((user_from_store) => {
    if (user_from_store && user_from_store.isEnrolled()) {
      console.log('Successfully loaded admin from persistence');
      admin_user = user_from_store;
      return null;
    } else {
      // need to enroll it with CA server
      return fabric_ca_client.enroll({
        enrollmentID: 'admin',
        enrollmentSecret: 'adminpw'
      }).then((enrollment) => {
        console.log('Successfully enrolled admin user "admin"');
        return fabric_client.createUser(
          {
            username: 'admin',
            mspid: _this.config.tradingCenter.mspid,
            cryptoContent: { privateKeyPEM: enrollment.key.toBytes(), signedCertPEM: enrollment.certificate }
          });
      }).then((user) => {
        admin_user = user;
        return fabric_client.setUserContext(admin_user);
      });
    }
  }).then(() => {
    console.log('Assigned the admin user to the fabric client ::' + admin_user.toString());
    return Promise.resolve()
  });
};

prototype.getUserAcceptedProjects = function(username, type) {
  var _this = this;

  var request = {
    fcn: 'getUserAcceptedProjects',
    args: [username, type],
  };

  return _this.query(request).then(res => Promise.resolve(res))
    .catch(err => Promise.reject(err.toString()));
};

prototype.getOnSaleProjects = function() {
  var _this = this;

  var request = {
    fcn: 'getOnSaleProjects',
    args: [],
  };

  return _this.query(request).then(res => Promise.resolve(res))
  .catch(err => Promise.reject(err.toString()));
}

prototype.getTransaction = function(id) {
  var _this = this;

  var request = {
    fcn: 'getTransaction',
    args: [id],
  };

  return _this.query(request).then(res => Promise.resolve(res))
    .catch(err => Promise.reject(err.toString()));
};

prototype.purchase = function(buyId, sellId, amount, id) {
  var _this = this;

  var request = {
    fcn: 'purchase',
    args: [buyId, sellId, amount, id],
  };

  return _this.invoke(request).then(res => Promise.resolve(res))
    .catch(err => Promise.reject(err.toString()));
};

prototype.confirm = function(id, option) {
  var _this = this;

  var request = {
    fcn: 'confirm',
    args: [id, option],
  };

  return _this.invoke(request).then(res => Promise.resolve(res))
    .catch(err => Promise.reject(err.toString()));
};

module.exports = TradingCenter;