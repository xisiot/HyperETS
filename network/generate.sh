#!/bin/sh
#
# Copyright IBM Corp All Rights Reserved
#
# SPDX-License-Identifier: Apache-2.0
#
export PATH=$GOPATH/src/github.com/hyperledger/fabric/build/bin:${PWD}/../bin:${PWD}:$PATH
export PATH=$PATH:/home/yp/fabric/bin     #bin path

# channel name
CHANNEL_NAME=mychannel

# remove previous crypto material and config transactions
rm -fr config/*
rm -fr crypto-config/*

# generate crypto material
cryptogen generate --config=./crypto-config.yaml
if [ "$?" -ne 0 ]; then
  echo "Failed to generate crypto material..."
  exit 1
fi

# generate genesis block for orderer
configtxgen -profile TwoOrgsOrdererGenesis -outputBlock ./config/genesis.block
if [ "$?" -ne 0 ]; then
  echo "Failed to generate orderer genesis block..."
  exit 1
fi

# generate channel configuration transaction
configtxgen -profile TwoOrgsChannel -outputCreateChannelTx ./config/channel.tx -channelID $CHANNEL_NAME
if [ "$?" -ne 0 ]; then
  echo "Failed to generate channel configuration transaction..."
  exit 1
fi

# generate anchor peer transaction
configtxgen -profile TwoOrgsChannel -outputAnchorPeersUpdate ./config/AgencyMSPanchors.tx -channelID $CHANNEL_NAME -asOrg AgencyMSP
if [ "$?" -ne 0 ]; then
  echo "Failed to generate anchor peer update for Agency..."
  exit 1
fi

# generate anchor peer transaction two
configtxgen -profile TwoOrgsChannel -outputAnchorPeersUpdate ./config/CenterMSPanchors.tx -channelID $CHANNEL_NAME -asOrg CenterMSP
if [ "$?" -ne 0 ]; then
  echo "Failed to generate anchor peer update for Center..."
  exit 1
fi
