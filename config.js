module.exports = {
	hub:{
		host:"localhost",
		port:"4200"
	},
	
	datahub:{
		host:"localhost",
		port:"4201",
		dataPath:"/tmp",
		defaultSessionName:"public",

		db:{
			host:"localhost",
			name:"things",
			user:"things",
			password:"s3cr3t"
		}
	},
	
	cam:{
		driver: "v4l",
		device: "/dev/video0",
		port: 4210,
		defaultName: "camera",
		signalPort: 4250
	},
	
	record:{
		sourceHost: "localhost",
		sourcePort: "4250",
		defaultName: "cam",
		dataPath: "/tmp",
		extension: ".mkv"
	}
	
};

