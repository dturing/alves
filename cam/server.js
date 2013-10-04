#!/usr/bin/env node

var url = require("url");
var util = require("util");
var os = require("os");
var querystring = require("querystring");
var connect = require("connect");
var gstreamer = require("gstreamer-superficial");

var conf = require("../config.js").cam;

var node = {
	name:os.hostname()+"_"+conf.defaultName,
	driver:conf.driver,
	device:conf.device,
	signalPort:conf.signalPort,
};

//doSpawnRepeated( "../camera/camera", [node.driver,node.device,node.signalPort] );

function startPipeline() {
	var pipeline = new gstreamer.Pipeline(
		"v4l2src ! video/x-raw-yuv, width=640, height=480, framerate=(fraction)30"
	//	"videotestsrc num-buffers=120 is-live=true"
			+" ! neartime"
			+" ! rate post-message=true dump=false update=.25"
			+" ! tcpserversink sync=false buffers-soft-max=3 buffers-max=10 recover-policy=latest protocol=gdp port="+conf.signalPort
			);

/*
	"v4l2src name=palsrc device="+camSpec+" ! video/x-raw-yuv, width=720, height=574 ! queue leaky=downstream max-size-buffers=5 ! deinterlace method=linear fields=top ! ffmpegcolorspace ! neartime";
				case "dc":
					"wdc1394 index="+camSpec+" ! ffmpegcolorspace ! videorate ! video/x-raw-yuv, rate=(fraction)25/1";
				case "dv":
					"dv1394src skip=1 ! dvdemux ! dvdec ! ffmpegcolorspace";
				default:
					throw("failure in input specification: "+input+" "+camSpec);
			}

		var p = src
				+" ! wmotion presence-weight=0.0001 presence-threshold=16 motion-weight=.5 ! uvblur uh=5 vh=5"
	//			+" ! wstaticbgmotion presence-threshold=24 presence-weight=0 motion-weight=.6 bgfile=/opt/badco/thingsseen/notes/setup/bg.raw ! uvblur uh=5 vh=5"
				+" ! rate post-message=true dump=false update=.25"
				+" ! tcpserversink sync=false buffers-soft-max=3 buffers-max=10 recover-policy=latest protocol=gdp port="+port;
*/

/*
		var palsrc = pipeline.findChild("palsrc");
		if( palsrc!=null ) {
			trace("setting input norm to PAL");
			try {
				palsrc.setNorm("PAL");
			} catch(e:Dynamic) {
				trace("Warning: "+e);
			}
		}

		pipeline.preroll( handleBusMessage );
*/

	pipeline.pollBus( function(msg) {
		switch( msg.type ) {
			case "eos": 
				console.log("End of Stream");
				pipeline.stop();
				setTimeout( startPipeline, 1000 );
				break;
			case "application":
				switch( msg.name ) {
					case "rate":
						node.fps = msg.fps;
						node.Bps = msg.Bps;
						node.lastUpdate = new Date();
						break;
				}
				break;
		}
	});

	pipeline.play();
}

startPipeline();

console.log("See my stream by using: gst-launch-0.10 tcpclientsrc protocol=gdp port="+conf.signalPort+" host=localhost ! ffmpegcolorspace ! ximagesink sync=false");



/*
spawn("v4lctl",["bright","128"]);
spawn("v4lctl",["contrast","64"]);
spawn("v4lctl",["color","0"]);
spawn("v4lctl",["hue","0"]);
*/


function reply( res, reply ) {
	res.writeHead(200, {
					"Content-Type":	"text-plain",
					"Cache-Control":"no-cache"
					});
	res.end(reply+"\n");
}

connect.createServer(
//	connect.logger(),
	connect.router( function(app) {
			app.get("/info", function(req,res,next){
				reply(res,JSON.stringify(node));
			})
		}),
	function( req,res,next ) {
		res.writeHead(404, {"Content-Type":"text-plain"});
		res.end( "no such resource\n" );
	},
	connect.errorHandler({ dumpExceptions: true })
).listen(4210);

