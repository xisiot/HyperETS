'use strict';

const shim = require('fabric-shim');
const util = require('util');
const _ = require('lodash');

const PREFIX_USER = 'USER';
const PREFIX_CORP_APPROVAL = 'CORP_APPROVAL';
const PREFIX_PROJECT = 'PROJECT';
const PREFIX_USER2CROP = 'USER2CROP';
const PREFIX_USER2PROJECT = 'USER2PROJECT';
const PREFIX_TRANSACTION = 'TRANSACTION';

let Chaincode = class {

  async Init(stub) {
    console.info('=========== Instantiated emission-trade chaincode ===========');
    return shim.success();
  }

  // The Invoke method is called as a result of an application request to run the Smart Contract
  async Invoke(stub) {
    let ret = stub.getFunctionAndParameters();
    console.info(ret);

    let method = this[ret.fcn];
    if (!method) {
      console.error('no function of name:' + ret.fcn + ' found');
      return shim.error('Received unknown function ' + ret.fcn + ' invocation');
    }
    try {
      let payload = await method(stub, ret.params);
      return shim.success(payload);
    } catch (err) {
      console.log('ERROR: ', err);
      return shim.error(err);
    }
  }

  /******************************* for normal user ********************************/

  /**
   * Create a user.
   * 
   * @param {String} args[0]: username
   * @param {String} args[1]: password
   * @returns null or errMsg
   */
  async createUser(stub, args) {
    if (args.length !== 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }

    let value = {
      username: args[0],
      password: args[1],
    };

    let userKey = stub.createCompositeKey(PREFIX_USER, [value.username]);
    console.log('userKey', userKey);

    let userExist = await stub.getState(userKey);
    if (userExist && userExist.toString()) {
      throw new Error('user already exists');
    }

    await stub.putState(userKey, Buffer.from(JSON.stringify(value)));
  }

  /**
   * Get userinfo by username.
   * 
   * @param {String} args[0]: username
   * @returns {Object} user
   */
  async getUserInfo(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let userKey = stub.createCompositeKey(PREFIX_USER, [args[0]]);
    let user = null;

    try {
      let value = await stub.getState(userKey);

      if (value && value.toString()) {
        user = value;
      }
    } catch (err) {
      throw new Error(err);
    }

    return user;
  }

  /**
   * Get corpApprovals by username.
   * 
   * @param {String} args[0]: username
   * @returns {Object[]} approvals
   */
  async getUserCorpApprovals(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let approvals = [];
    let relationKey = stub.createCompositeKey(PREFIX_USER2CROP, [args[0]]);
    let value = await stub.getState(relationKey);
    if (!value || !value.toString()) {
      return Buffer.from(JSON.stringify(approvals));
    }

    value = JSON.parse(value.toString());
    for (let i = 0; i < value.length; i++) {
      let id = value[i];
      let key = stub.createCompositeKey(PREFIX_CORP_APPROVAL, [id]);
      let approval = await stub.getState(key);
      if (approval && approval.toString()) {
        approvals.push(JSON.parse(approval.toString()));
      }
    }

    return Buffer.from(JSON.stringify(approvals));
  }

  /**
   * Get projApprovals by username.
   * 
   * @param {String} args[0]: username 
   * @returns {Object[]} projects
   */
  async getUserProjects(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let projects = [];
    let relationKey = stub.createCompositeKey(PREFIX_USER2PROJECT, [args[0]]);
    let value = await stub.getState(relationKey);
    if (!value || !value.toString()) {
      return Buffer.from(JSON.stringify(projects));
    }

    console.log('has projects');
    value = JSON.parse(value.toString());
    for (let i = 0; i < value.length; i++) {
      let id = value[i];
      let key = stub.createCompositeKey(PREFIX_PROJECT, [id]);
      let project = await stub.getState(key);
      if (project && project.toString()) {
        projects.push(JSON.parse(project.toString()));
      }
    }

    return Buffer.from(JSON.stringify(projects));
  }

  /**
  * Post a corpApproval.
  * 
  * @param {Object} args[0]
  * @returns null
  */
  async postCorpApproval(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let extra = {
      status: 'processing',
      project_id: null,
    };

    let value = _.assign(JSON.parse(args[0]), extra);
    let key = stub.createCompositeKey(PREFIX_CORP_APPROVAL, [value.id]);

    await stub.putState(key, Buffer.from(JSON.stringify(value)));

    // write to relation table
    let relationKey = stub.createCompositeKey(PREFIX_USER2CROP, [value.applicant]);
    let userProjects = await stub.getState(relationKey);

    if (userProjects && userProjects.toString()) {
      userProjects = JSON.parse(userProjects.toString());
      userProjects.push(value.id);
    } else {
      userProjects = [value.id];
    }

    await stub.putState(relationKey, Buffer.from(JSON.stringify(userProjects)));

    console.log('approval: ', value)
    return Buffer.from(JSON.stringify(value));
  }

  /**
  * Post a prjAojproval.
  * 
  * @param {Object} args[0]
  * @returns null
  */
  async postProject(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let extra = {
      completed_transactions: null,
      processing_transaction: null,
      status: 'processing',
    };

    let value = _.assign(JSON.parse(args[0]), extra);
    let key = stub.createCompositeKey(PREFIX_PROJECT, [value.id]);

    await stub.putState(key, Buffer.from(JSON.stringify(value)));

    // write to relation table
    let relationKey = stub.createCompositeKey(PREFIX_USER2PROJECT, [value.applicant]);
    let userProjects = await stub.getState(relationKey);

    if (userProjects && userProjects.toString()) {
      userProjects = JSON.parse(userProjects.toString());
      userProjects.push(value.id);
    } else {
      userProjects = [value.id];
    }

    await stub.putState(relationKey, Buffer.from(JSON.stringify(userProjects)));

    // write to corpApproval
    let corpKey = stub.createCompositeKey(PREFIX_CORP_APPROVAL, [value.corp_approval_id]);
    let corpApproval = await stub.getState(corpKey);

    if (corpApproval && corpApproval.toString()) {
      corpApproval = JSON.parse(corpApproval);
      corpApproval.project_id = value.id;
      await stub.putState(corpKey, Buffer.from(JSON.stringify(corpApproval)));
    }

    console.log('proejct: ', value)
    return Buffer.from(JSON.stringify(value));
  }

  /***************************** for administrator of agency ****************************/

  /**
  * Get all corpApprovals by status
  * 
  * @param {String[]} args[0]:status
  * @returns {Object[]}
  */
  async getCorpApprovals(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let approvals = [];
    let status = JSON.parse(args[0]);
    let iterator = await stub.getStateByPartialCompositeKey(PREFIX_CORP_APPROVAL, []);
    while (true) {
      let result = await iterator.next();
      if (!result || !result.value || !result.value.key) {
        break;
      }
      let split = stub.splitCompositeKey(result.value.key);
      let id = split.attributes[0];
      console.log('id: ', id);

      let key = stub.createCompositeKey(PREFIX_CORP_APPROVAL, [id]);
      let value = await stub.getState(key);
      if (value && value.toString()) {
        value = JSON.parse(value);
        if (status.indexOf(value.status) != -1) {
          console.log('add');
          approvals.push(value);
        }
      }
    }

    console.log('approvals: ', approvals);
    return Buffer.from(JSON.stringify(approvals));
  }

  /**
  * Get all projects by status
  * 
  * @param {String[]} args[0]:status
  * @returns {Object[]}
  */
  async getProjects(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let projects = [];
    let status = JSON.parse(args[0]);
    let iterator = await stub.getStateByPartialCompositeKey(PREFIX_PROJECT, []);
    while (true) {
      let result = await iterator.next();
      if (!result || !result.value || !result.value.key) {
        break;
      }
      let split = stub.splitCompositeKey(result.value.key);
      let id = split.attributes[0];

      let key = stub.createCompositeKey(PREFIX_PROJECT, [id]);
      let value = await stub.getState(key);
      if (value && value.toString()) {
        value = JSON.parse(value);
        if (status.indexOf(value.status) != -1) {
          projects.push(value);
        }
      }
    }
    return Buffer.from(JSON.stringify(projects));
  }

  /**
   * Get corpApproval by id.
   * 
   * @param {String} args[0]:id
   * @returns {Object} value
   */
  async getCorpApproval(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let key = stub.createCompositeKey(PREFIX_CORP_APPROVAL, [args[0]]);
    let value = await stub.getState(key);

    return value;
  }

  /**
   * Get project by id.
   * 
   * @param {String} args[0]:id 
   * @returns {Object} value
   */
  async getProject(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let key = stub.createCompositeKey(PREFIX_PROJECT, [args[0]]);
    let value = await stub.getState(key);

    return value;
  }

  /**
   * Sign a corp approval.
   * 
   * @param {String} args[0]: id
   * @param {String} args[1]: status
   * @returns null
   */
  async signCorpApproval(stub, args) {
    if (args.length !== 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }

    let key = stub.createCompositeKey(PREFIX_CORP_APPROVAL, [args[0]]);
    let value = await stub.getState(key);

    if (!value || !value.toString()) {
      throw new Error('CorpApproval not exists')
    }

    value = JSON.parse(value.toString());
    value.status = args[1];

    await stub.putState(key, Buffer.from(JSON.stringify(value)));
  }

  /**
   * Sign a project approval.
   * 
   * @param {String} args[0]: id
   * @param {String} args[1]: status
   * @returns null
   */
  async signProject(stub, args) {
    if (args.length !== 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }

    let key = stub.createCompositeKey(PREFIX_PROJECT, [args[0]]);
    let value = await stub.getState(key);

    if (!value || !value.toString()) {
      throw new Error('Project not exists');
    }

    value = JSON.parse(value.toString());
    value.status = args[1];

    await stub.putState(key, Buffer.from(JSON.stringify(value)));
  }

  /********************** trading center **********************/

  /**
   * Get all accepted projects by username & type.
   * 
   * @param {String} args[0]: username
   * @param {String} args[1]: type-buy/sell
   * @returns {Object[]}  
   */
  async getUserAcceptedProjects(stub, args) {
    if (args.length !== 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }

    let projects = [];
    let type = args[1];
    let relationKey = stub.createCompositeKey(PREFIX_USER2PROJECT, [args[0]]);
    let projectIds = await stub.getState(relationKey);
    if (!projectIds || !projectIds.toString()) {
      return Buffer.from(JSON.stringify(projects));
    }

    projectIds = JSON.parse(projectIds.toString());
    let validStatus = ['accepted', 'trading', 'done'];
    for (let i = 0; i < projectIds.length; i++) {
      let id = projectIds[i];
      let key = stub.createCompositeKey(PREFIX_PROJECT, [id]);
      let value = await stub.getState(key);
      if (value && value.toString()) {
        value = JSON.parse(value.toString());

        // type: buy/sell status: accepted/trading/done
        if (value.type === type && validStatus.indexOf(value.status) !== -1) {
          projects.push(value);
        }
      }
    }

    return Buffer.from(JSON.stringify(projects));
  }

  /**
   * Get all on sale projects.
   * 
   * @returns {Object[]} 
   */
  async getOnSaleProjects(stub, args) {
    let projects = [];
    let iterator = await stub.getStateByPartialCompositeKey(PREFIX_PROJECT, []);

    while (true) {
      let result = await iterator.next();
      if (!result || !result.value || !result.value.key) {
        break;
      }
      let split = stub.splitCompositeKey(result.value.key);
      let id = split.attributes[0];

      let key = stub.createCompositeKey(PREFIX_PROJECT, [id]);
      let value = await stub.getState(key);
      if (value && value.toString()) {
        value = JSON.parse(value);

        // value: accepted(free)/
        if (value.type === 'sell' && value.status === 'accepted') {
          projects.push(value);
        }
      }
    }

    return Buffer.from(JSON.stringify(projects));
  }

  /**
   * Purchase target project.
   * 
   * @param {String} args[0]: buyProjectId
   * @param {String} args[1]: sellProjectId 
   * @param {String} args[2]: amount
   * @param {String} args[3]: id
   * @returns null
   */
  async purchase(stub, args) {
    if (args.length !== 4) {
      throw new Error('Incorrect number of arguments. Expecting 4');
    }

    let buyerId = args[0];
    let sellerId = args[1];
    let amount = parseInt(args[2]);
    let id = args[3];

    let transaction = {
      id: id,
      buy_project_id: buyerId,
      sell_project_id: sellerId,
      transaction_emission_permits: amount,
      status: 'processing'
    };

    //buyer
    let buyerKey = stub.createCompositeKey(PREFIX_PROJECT, [buyerId]);
    let buyerValue = await stub.getState(buyerKey);
    if (!buyerValue || !buyerValue.toString()) {
      throw new Error('Buyer not exists');
    }

    buyerValue = JSON.parse(buyerValue.toString());
    if (buyerValue.remain_emission_permits <= amount) {
      throw new Error('buyer remain emission permits not enough');
    }

    buyerValue.processing_transaction = id;
    buyerValue.status = 'trading';

    //seller
    let sellerKey = stub.createCompositeKey(PREFIX_PROJECT, [sellerId]);
    let sellerValue = await stub.getState(sellerKey);
    if (!sellerValue || !sellerValue.toString()) {
      throw new Error('Seller not exists');
    }

    sellerValue = JSON.parse(sellerValue.toString());
    if (sellerValue.remain_emission_permits <= amount) {
      throw new Erro('seller remian emission permits not enough');
    }

    sellerValue.processing_transaction = id;
    sellerValue.status = 'trading';

    //write
    await stub.putState(buyerKey, Buffer.from(JSON.stringify(buyerValue)));
    await stub.putState(sellerKey, Buffer.from(JSON.stringify(sellerValue)));

    let key = stub.createCompositeKey(PREFIX_TRANSACTION, [id]);
    console.log('transacntion: ', transaction)
    await stub.putState(key, Buffer.from(JSON.stringify(transaction)));
  }

  /**
   * Get transaction info by id.
   * 
   * @param {String} args[0]: transacntionId 
   * @returns {Object} 
   */
  async getTransaction(stub, args) {
    if (args.length !== 1) {
      throw new Error('Incorrect number of arguments. Expecting 1');
    }

    let key = stub.createCompositeKey(PREFIX_TRANSACTION, [args[0]]);
    let value = await stub.getState(key);
    if (!value || !value.toString()) {
      throw new Error('Transaction not exists');
    }

    value = JSON.parse(value.toString());
    let transaction = {
      transaction_emission_permits: value.transaction_emission_permits,
      status: value.status
    };

    let buyerKey = stub.createCompositeKey(PREFIX_PROJECT, [value.buy_project_id]);
    let buyerValue = await stub.getState(buyerKey);
    if (!buyerValue || !buyerValue.toString()) {
      throw new Error('Buyer not exists');
    }

    buyerValue = JSON.parse(buyerValue.toString());
    transaction.buyer_project = buyerValue;

    let sellerKey = stub.createCompositeKey(PREFIX_PROJECT, [value.sell_project_id]);
    let sellerValue = await stub.getState(sellerKey);
    if (!sellerValue || !sellerValue.toString()) {
      throw new Error('Seller not exists');
    }

    sellerValue = JSON.parse(sellerValue.toString());
    transaction.seller_project = sellerValue;;

    console.log('transaction: ', transaction);
    return Buffer.from(JSON.stringify(transaction));
  }

  /**
   * Confirm a transaction.
   * 
   * @param {String} args[0]: transactionId 
   * @param {String} args[1]: option
   */
  async confirm(stub, args) {
    if (args.length !== 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }

    let transactionId = args[0];
    let key = stub.createCompositeKey(PREFIX_TRANSACTION, [transactionId]);
    let value = await stub.getState(key);

    if (!value || !value.toString()) {
      throw new Error('Transaction not exists');
    }

    let option = args[1];
    value = JSON.parse(value.toString());

    //buyer
    let buyerKey = stub.createCompositeKey(PREFIX_PROJECT, [value.buy_project_id]);
    let buyerValue = await stub.getState(buyerKey);
    if (!buyerValue || !buyerValue.toString()) {
      throw new Error('Buyer not exists');
    }

    buyerValue = JSON.parse(buyerValue.toString());
    buyerValue.processing_transaction = null;
    let buyer_completed_transactions = buyerValue.completed_transactions || [];
    buyer_completed_transactions.push(transactionId);
    buyerValue.completed_transactions = buyer_completed_transactions;

    //seller
    let sellerKey = stub.createCompositeKey(PREFIX_PROJECT, [value.sell_project_id]);
    let sellerValue = await stub.getState(sellerKey);
    if (!sellerValue || !sellerValue.toString()) {
      throw new Error('Seller not exists');
    }

    sellerValue = JSON.parse(sellerValue.toString());
    sellerValue.processing_transaction = null;
    let seller_completed_transactions = sellerValue.completed_transactions || [];
    seller_completed_transactions.push(transactionId);
    sellerValue.completed_transactions = seller_completed_transactions;

    // accept
    if (option === 'accepted') {
      value.status = 'accepted';

      buyerValue.remain_emission_permits = buyerValue.remain_emission_permits - value.transaction_emission_permits;
      buyerValue.status = buyerValue.remain_emission_permits === 0 ? 'done' : 'accepted';
      await stub.putState(buyerKey, Buffer.from(JSON.stringify(buyerValue)));

      sellerValue.remain_emission_permits = sellerValue.remain_emission_permits - value.transaction_emission_permits;
      sellerValue.status = sellerValue.remain_emission_permits === 0 ? 'done' : 'accepted';
      await stub.putState(sellerKey, Buffer.from(JSON.stringify(sellerValue)));
    } else if (option === 'rejected') {
      value.status = 'rejected';

      buyerValue.status = 'accepted';
      await stub.putState(buyerKey, Buffer.from(JSON.stringify(buyerValue)));

      sellerValue.status = 'accepted';
      await stub.putState(sellerKey, Buffer.from(JSON.stringify(sellerValue)));
    }

    await stub.putState(key, Buffer.from(JSON.stringify(value)));
  }
}

shim.start(new Chaincode());