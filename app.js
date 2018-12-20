var express = require('express');
var Promise = require('bluebird');
var bodyParser = require('body-parser');
var _ = require('lodash');
var path = require('path');
var util = require('util');
var os = require('os');
var uuidv4 = require('uuid/v4');
var Fabric_Client = require('fabric-client');
var Fabric_CA_Client = require('fabric-ca-client');

var app = express();
var envAgency = require('./organization/envAgency');
var tradingCenter = require('./organization/tradingCenter');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
var server = null;

app.post('/register', (req, res) => {
  let username = req.body.username;
  let password = req.body.password;
  if (!username || !password) {
    res.status(400).send(wrapErr('parameter not found'));
  }

  envAgency.register(username, password)
    .then(() => res.status(201).end())
    .catch(err => res.status(500).send(wrapErr(err)));
});

app.post('/login', (req, res) => {
  let username = req.body.username;
  let password = req.body.password;

  if (!username || !password) {
    res.status(400).send(wrapErr('parameter not found'));
    return;
  }

  envAgency.getUserInfo(username)
    .then(user => {
      if (!user) {
        res.status(400).send(wrapErr('user not exists'));
        return;
      }

      user = JSON.parse(user);
      if (password !== user.password) {
        res.status(400).send(wrapErr('pasword error'));
        return;
      }

      res.status(200).end();
    }).catch(err => res.status(500).send(wrapErr(err)));
});

app.route('/corpApprovals')
  .get((req, res) => {
    let applicant = req.query.applicant;
    let status = req.query.status;
    let id = req.query.id;
    let promise = null;

    if (id) {
      promise = envAgency.getCorpApproval(id);
    } else {
      promise = envAgency.getCorpApprovals(applicant, status);
    }

    promise.then(approvals => {
      console.log(approvals);
      if (!approvals) {
        res.status(400).send(wrapErr('approvals not exists'));
        return;
      }

      approvals = JSON.parse(approvals);
      res.status(200).send(approvals);
    }).catch(err => res.status(500).send(wrapErr(err)));

  })
  .post((req, res) => {
    let approval = {
      id: uuidv4(),
      applicant: req.body.applicant,
      name: req.body.name,
      certificate: req.body.certificate,
    };

    if (!approval.applicant || !approval.name || !approval.certificate) {
      res.status(400).send(wrapErr('parameter not found'));
      return;
    }

    envAgency.postCorpApproval(approval)
      .then(approval => {
        if (!approval) {
          res.status(400).send(wrapErr('approval post error'));
          return;
        }

        approval = JSON.parse(approval);
        res.status(201).send(approval);
      }).catch(err => res.status(500).send(wrapErr(err)));

  });

app.post('/corpApprovals/sign', (req, res) => {
  let id = req.body.id;
  let status = req.body.status;

  if (!id || !status) {
    res.status(400).send(wrapErr('parameter not found'));
    return;
  }

  if (status !== 'accepted' && status !== 'rejected') {
    res.status(400).send(wrapErr('invalid status'));
    return;
  }

  envAgency.signCorpApproval(id, status)
    .then(() => res.status(200).end())
    .catch(err => res.status(500).send(wrapErr(err)));
});

app.route('/projects')
  .get((req, res) => {
    let id = req.query.id;
    let status = req.query.status;
    let applicant = req.query.applicant;
    let type = req.query.type;
    let promise = null;

    if (id) { // find by id
      promise = envAgency.getProject(id);
    } else {
      if (applicant && type) { // has applicant
        promise = tradingCenter.getUserAcceptedProjects(applicant, type);
      } else {
        if (status) { // has status
          if (type) { // get on sale projects
            promise = tradingCenter.getOnSaleProjects();
          } else {
            promise = envAgency.getProjects(null, status);
          }
        } else { // has nothing
          promise = envAgency.getProjects(null, null);
        }
      }
    }

    promise.then(projects => {
      if (!projects) {
        res.status(400).send(wrapErr('projects not exists'));
        return;
      }

      projects = JSON.parse(projects);
      res.status(200).send(projects);
    }).catch(err => res.status(500).send(wrapErr(err)));

  })
  .post((req, res) => {
    let project = {
      id: uuidv4(),
      corp_approval_id: req.body.corp_approval_id,
      applicant: req.body.applicant,
      name: req.body.name,
      type: req.body.type,
      initial_emission_permits: parseInt(req.body.initial_emission_permits),
      target_emission_permits: parseInt(req.body.target_emission_permits),
      remain_emission_permits: parseInt(req.body.remain_emission_permits),
    };

    if (!project.corp_approval_id || !project.applicant || !project.name || !project.type
      || !project.initial_emission_permits || !project.target_emission_permits
      || !project.remain_emission_permits) {
      res.status(400).send(wrapErr('parameter not found'));
      return;
    }

    envAgency.postProject(project)
      .then(project => {
        if (!project) {
          res.status(400).send(wrapErr('project post error'));
          return;
        }

        project = JSON.parse(project);
        res.status(201).send(project);
      }).catch(err => res.status(500).send(wrapErr(err)));
  });

app.post('/projects/sign', (req, res) => {
  let id = req.body.id;
  let status = req.body.status;

  if (!id || !status) {
    res.status(400).send(wrapErr('parameter not found'));
    return;
  }

  if (status !== 'accepted' && status !== 'rejected') {
    res.status(400).send(wrapErr('invalid status'));
    return;
  }

  envAgency.signProject(id, status)
    .then(() => res.status(200).end())
    .catch(err => res.status(500).send(wrapErr(err)));
});

app.route('/transactions')
  .get((req, res) => {
    let id = req.query.id;

    if (!id) {
      res.status(400).send(wrapErr('parameter not found'));
      return;
    }

    tradingCenter.getTransaction(id)
      .then(transaction => {
        if (!transaction) {
          res.status(200).send(wrapErr('transaction not exists'));
          return;
        }

        transaction = JSON.parse(transaction);
        res.status(200).send(transaction);
      }).catch(err => res.status(500).send(wrapErr(err)));

  })
  .post((req, res) => {
    let id = req.body.id;
    let status = req.body.status;

    if (!id || !status) {
      res.status(400).send(wrapErr('parameter not found'));
      return;
    }

    if (status !== 'accepted' && status !== 'rejected') {
      res.status(400).send(wrapErr('invalid status'));
      return;
    }

    tradingCenter.confirm(id, status)
      .then(() => res.status(200).end())
      .catch(err => res.status(500).send(wrapErr(err)));
  });

app.post('/purchase', (req, res) => {
  let buyId = req.body.buy_project_id;
  let sellId = req.body.sell_project_id;
  let amount = req.body.transaction_emission_permits;
  let id = uuidv4();

  if (!buyId || !sellId || !amount) {
    res.status(400).send(wrapErr('parameter not found'));
    return;
  }

  tradingCenter.purchase(buyId, sellId, amount, id)
    .then(() => res.status(200).end())
    .catch(err => res.status(500).send(wrapErr(err)));
});

function wrapErr(err) {
  return {
    errMsg: err
  };
}

Promise.all([envAgency.enrollAdmin(), tradingCenter.enrollAdmin()])
  .then(() => {
    server = app.listen(9021, () => console.log('server started, listen port: 9021'));
  })
  .catch(err => console.log(err.toString()));

