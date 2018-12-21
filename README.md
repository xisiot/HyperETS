# HyperETS
This is the source code of the emission trading system that mentioned in the paper: **Design and Implementation on Hyperledger-based Emission Trading System**. It constains the network part and the HTTP server part.
## How to Use
### System Requirements
To setup this system, please make sure your server has the [hyperledger fabric environment](https://hyperledger-fabric.readthedocs.io/en/latest/prereqs.html). 
### Getting Started
- Run ***npm install*** at the home directoryi
- Go to *chaincode/emission_trade* directory and run ***npm install***
- Run ***tar -cvf node_modules.tar.gz node_modules/***
- Run ***./network/start.sh*** to start the hyperledger fabric network
- Run ***node app.js*** to start the HTTP server listening on port 9021

After these steps, you will start a RESTful HTTP server which provides the emission trading services. You can customize your own applications (Mobile App or Web) using these HTTP interfaces. The details of the interfaces can be found at the app.js.

