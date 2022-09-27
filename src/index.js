const fs = require("fs");
const path = require("path");
const storage = require("node-persist");
const { spawn } = require("child_process");
const fetch = require("node-fetch");
const express = require("express");
const rateLimit = require("express-rate-limit");

const packageJson = require("../package.json");
const options = require("./utils/options.js");


const app = express();
let Service, Characteristic, storagePath;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	storagePath = homebridge.user.storagePath();

	homebridge.registerAccessory(
		"homebridge-irrigation",
		"irrigation",
		Irrigation
	);
};

function Irrigation(log, config) {
	this.log = log
	this.config = config
	this.zones = config.zones;
	this.zoned = this.zones.length || 1
	this.accessoryValve = []
	this.zoneDuration = []
	this.zoneTimeEnd = []
	this.accessorySwitch = []
	
	this.service = new Service.IrrigationSystem(config.name)
	this.service
		.setCharacteristic(Characteristic.ProgramMode, 0)
		.setCharacteristic(Characteristic.Active, 1)
		.setCharacteristic(Characteristic.InUse, 0)
		.setCharacteristic(Characteristic.RemainingDuration, 0)
		.setCharacteristic(Characteristic.StatusFault, 0)
	this.service
		.getCharacteristic(Characteristic.On)
		
	

	// Accessory information
	this.accessoryInformationService = new Service.AccessoryInformation();

	this.accessoryInformationService.setCharacteristic(
		Characteristic.Identify,
		true
	);
	this.accessoryInformationService.setCharacteristic(
		Characteristic.Manufacturer,
		"Domi"
	);
	this.accessoryInformationService.setCharacteristic(
		Characteristic.Model,
		"DIY"
	);
	this.accessoryInformationService.setCharacteristic(
		Characteristic.Name,
		"homebridge-irrigation"
	);
	this.accessoryInformationService.setCharacteristic(
		Characteristic.SerialNumber,
		"S3CUR1TYSYST3M"
	);
	this.accessoryInformationService.setCharacteristic(
		Characteristic.FirmwareRevision,
		packageJson.version
	);

	// Services list
	this.services = [this.service, this.accessoryInformationService];

	for (let zone = 1; zone <= this.zoned; zone++) {
		this.zoneDuration[zone] = this.zones[zone - 1].setDuration * 60
		this.zoneTimeEnd[zone] = 0
		
		this.accessoryValve[zone] = new Service.Valve(this.zones[zone - 1].zonename, zone)
		this.accessoryValve[zone]
			.getCharacteristic(Characteristic.On)
			/*.onGet(this.getOnHandlerValve.bind(this, zone))
			.onSet(this.setOnHandlerValve.bind(this, zone))*/
			
		this.accessoryValve[zone]
			.setCharacteristic(Characteristic.Active, 0)
			.setCharacteristic(Characteristic.InUse, 0)
			.setCharacteristic(Characteristic.ValveType, 1)
			.setCharacteristic(Characteristic.SetDuration, this.zones[zone - 1].setDuration * 60)
			.setCharacteristic(Characteristic.RemainingDuration, 0)
			.setCharacteristic(Characteristic.ServiceLabelIndex, zone)
			.setCharacteristic(Characteristic.Name, this.zones[zone - 1].zonename)
			.setCharacteristic(Characteristic.ConfiguredName, "Zone " + String(zone) + " " + this.zones[zone - 1].zonename)
			.setCharacteristic(Characteristic.IsConfigured, 1)
		this.accessoryValve[zone]
			.getCharacteristic(Characteristic.Active)
			.onGet(this.getOnHandlerValve.bind(this, zone))
			.onSet(this.setOnHandlerValve.bind(this, zone))
		this.accessoryValve[zone]
			.getCharacteristic(Characteristic.InUse)
			.onGet(this.getOnHandlerValve.bind(this, zone))
		this.accessoryValve[zone]
			.getCharacteristic(Characteristic.SetDuration)
			.setProps({ minValue: 0, maxValue: 7200 })
			.onSet(this.setOnHandlerZoneDuration.bind(this, zone))
		this.accessoryValve[zone]
			.getCharacteristic(Characteristic.RemainingDuration)
			.setProps({ minValue: 0, maxValue: 7200 })
			.onGet(this.getOnHandlerZoneDuration.bind(this, zone))
		
		this.service.addLinkedService(this.accessoryValve[zone])
		this.services.push(this.accessoryValve[zone])
		
		this.accessorySwitch[zone] = new Service.Switch("Zone " + String(zone) + " " + this.zones[zone - 1].zonename, zone)
		this.accessorySwitch[zone]
			.getCharacteristic(Characteristic.On)
			.onGet(this.getOnHandlerValve.bind(this, zone))
			.onSet(this.setOnHandlerSwitchValve.bind(this, zone))
		/*this.accessoryValve[zone]
			.getCharacteristic(Characteristic.InUse)
			.onGet(this.getOnHandlerValve.bind(this, zone))*/

		this.services.push(this.accessorySwitch[zone])
		
	}

	
	setInterval(() => {
		fetch("http://" + this.config.ip + ":8080/" + this.config.token + "/get/V" + this.config.pin)
			.then((response) => response.json())
			.then((data) =>  {  
				this.valve_1 = data[0] || 0;
				this.valve_2 = data[1] || 0;
				this.valve_3 = data[2] || 0;
				this.valve_4 = data[3] || 0;
			})
				.catch((error) => {
					this.log.error(`Request to webhook failed. (${path})`);
					this.log.error(error);
			});
	}, 1000);
		
	

  
}

Irrigation.prototype.setOnHandlerZoneDuration = function (zone, value){
	this.zoneDuration[zone] = value
}
Irrigation.prototype.getOnHandlerZoneDuration = function (zone){
	let retTime = (this.zoneDuration[zone] - ((Date.now() - this.zoneTimeEnd[zone])/1000))
	if(retTime < 0){
		retTime = 0
	}
	return retTime
}

Irrigation.prototype.getOnHandlerValve = function (zone) {
	switch(zone) {
		case 1:
			return this.valve_1;
		case 2:
			return this.valve_2;
		case 3:
			return this.valve_3;
		case 4:
			return this.valve_4;
	}
}
Irrigation.prototype.setOnHandlerValve = function (zone, value) {
	if(value == true){ value = 1 }else if(value == false){ value = 0 }
	if(value == 1){
		this.accessorySwitch[zone]
				.setCharacteristic(Characteristic.On, 1)
	}else{
		this.accessorySwitch[zone]
				.setCharacteristic(Characteristic.On, 0)
	}
}
Irrigation.prototype.setOnHandlerSwitchValve = function (zone, value) {
	if(value == true){ value = 1 }else if(value == false){ value = 0 }
	if(value == 1){
		this.zoneTimeEnd[zone] = Date.now()
		this.accessoryValve[zone]
			.setCharacteristic(Characteristic.RemainingDuration, this.zoneDuration[zone])
		setTimeout(() => {
			this.accessoryValve[zone]
				.setCharacteristic(Characteristic.Active, 0)
		}, this.zoneDuration[zone] * 1000)
	}
	this.accessoryValve[zone]
		.updateCharacteristic(Characteristic.InUse, value)
	this.setValueValve(zone, value)
}



Irrigation.prototype.setValueValve = function (zone, value) {
	switch(zone) {
		case 1:
			this.valve_1 = value;
			break;
		case 2:
			this.valve_2 = value;
			break;
		case 3:
			this.valve_3 = value;
			break;
		case 4:
			this.valve_4 = value;
			break;
	}
	let dataValue = String(this.valve_1) + "\",\"" + String(this.valve_2) + "\",\"" + String(this.valve_3) + "\",\"" + String(this.valve_4);
	
	fetch("http://" + this.config.ip + ":8080/" + this.config.token + "/update/V" + this.config.pin + "?value=" + dataValue)
		.then((response) => {  
			if (response.ok === false) {
				throw new Error(`Status code (${response.status})`);
			}
		})
			.catch((error) => {
				this.log.error(`Request to webhook failed. (${path})`);
				this.log.error(error);
		});
}

Irrigation.prototype.getServices = function () {
	return this.services;
};

