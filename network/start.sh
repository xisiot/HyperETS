#!/bin/bash
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#
# Exit on first error, print all commands.
set -ev

# don't rewrite paths for Windows Git Bash users
export MSYS_NO_PATHCONV=1
CC_SRC_PATH=/opt/gopath/src/github.com/emission_trade
starttime=$(date +%s)

docker-compose -f docker-compose.yml down

docker-compose -f docker-compose.yml up -d agency-ca.example.com orderer.example.com peer0.agency.example.com couchdb0 \
 couchdb1 peer0.center.example.com center-ca.example.com

# wait for Hyperledger Fabric to start
# incase of errors when running later commands, issue export FABRIC_START_TIMEOUT=<larger number>
export FABRIC_START_TIMEOUT=10
# echo ${FABRIC_START_TIMEOUT}
sleep ${FABRIC_START_TIMEOUT}

docker-compose -f ./docker-compose.yml up -d cli
# Create the channel
docker exec -e "CORE_PEER_LOCALMSPID=AgencyMSP" -e "CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/agency.example.com/users/Admin@agency.example.com/msp" \
 -e "CORE_PEER_ADDRESS=peer0.agency.example.com:7051" \
 cli peer channel create -o orderer.example.com:7050 -c mychannel -f /etc/hyperledger/configtx/channel.tx

# Join peer0.agency.example.com to the channel.
docker exec -e "CORE_PEER_LOCALMSPID=AgencyMSP" -e "CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/agency.example.com/users/Admin@agency.example.com/msp" \
 -e "CORE_PEER_ADDRESS=peer0.agency.example.com:7051" \
 cli peer channel join -b mychannel.block

# Join peer0.center.example.com to the channel.
docker exec -e "CORE_PEER_LOCALMSPID=CenterMSP" -e "CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/center.example.com/users/Admin@center.example.com/msp" \
 -e "CORE_PEER_ADDRESS=peer0.center.example.com:7051" \
 cli peer channel join -b mychannel.block

# Install chaincode on peer0.agency.example.com
docker exec -e "CORE_PEER_LOCALMSPID=AgencyMSP" -e "CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/agency.example.com/users/Admin@agency.example.com/msp" \
 -e "CORE_PEER_ADDRESS=peer0.agency.example.com:7051" \
 cli peer chaincode install -n emission_trade -v 1.0 -p "$CC_SRC_PATH" -l node

# Install chaincode on peer0.center.example.com
docker exec -e "CORE_PEER_LOCALMSPID=CenterMSP" -e "CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/center.example.com/users/Admin@center.example.com/msp" \
 -e "CORE_PEER_ADDRESS=peer0.center.example.com:7051" \
 cli peer chaincode install -n emission_trade -v 1.0 -p "$CC_SRC_PATH" -l node

# Instantiate chaincode on peer0.agency.example.com
docker exec -e "CORE_PEER_LOCALMSPID=AgencyMSP" -e "CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/agency.example.com/users/Admin@agency.example.com/msp" \
 -e "CORE_PEER_ADDRESS=peer0.agency.example.com:7051" \
 cli peer chaincode instantiate -o orderer.example.com:7050 -C mychannel -n emission_trade -l node -v 1.0 -c '{"Args":[""]}' -P "OR ('AgencyMSP.member','CenterMSP.member')"

printf "\nTotal setup execution time : $(($(date +%s) - starttime)) secs ...\n\n\n"