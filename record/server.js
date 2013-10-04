#!/usr/bin/env node

var url = require("url");
var util = require("util");
var os = require("os");
var fs = require("fs");
var querystring = require("querystring");
var connect = require("connect");
var gstreamer = require("gstreamer-superficial");
var mkdirp = require("mkdirp");
require("date-format-lite");

var conf = {
  sourceHost: "localhost",
  sourcePort: "4250",
  defaultName: "cam",
  dataPath: "/tmp",
  extension: ".mkv"
};

var node = {
	name:os.hostname()+"_"+conf.defaultName,
	openedBy:"",
	recording:false
};
var child=undefined;

var thingRE = /thing([0-9])/;
var r = thingRE.exec(os.hostname());
if( r!=null && r.length==2 ) node.name = r[1];

var gate;


function submitFile( tmpFilename, frames, closed, finished ) {
	console.log("captured ", frames, "frames to", tmpFilename, "closed at", closed );
	var now = new Date();
	var day = now.format("DD");
	var month = now.format("MM");
	var year = now.format("YYYY");
	var date = now.format("YYYYMMDD");
	var time = now.format("hhmmss");
	
	var path = conf.dataPath+"/"+year+"/"+month+"/"+date+"/"+node.name;
	var filename = path+"/"+date+"-"+time+conf.extension;
	console.log("mkdir", path );
	mkdirp( path, function(err) {
		if( err ) throw(err);
		fs.rename( tmpFilename, filename, function( err ) {
			if( err ) throw(err);
			console.log("Saved to", filename );
			finished();
		});
	});
	
	/* FIXME port this:

		trace("submitting "+tmpFilename+", "+frames+" frames ("+path+"/"+filename+"), trig "+triggerName+", tags "+tags+", m "+m+", p "+p);
		neko.FileSystem.rename( tmpFilename, path+"/"+filename );

		var rq = new haxe.Http( BASE_URL+"/submit" );
		rq.setParameter("filename",filename);
		rq.setParameter("trig",triggerName);
		rq.setParameter("camera",cameraName);
		rq.setParameter("tags",tags);
		rq.setParameter("m",m);
		rq.setParameter("p",p);
		rq.setParameter("frames",""+frames);
		rq.setParameter("date",""+DateTools.format(now,"%Y-%m-%d %H:%M:%S"));
		rq.request(false);

	*/	
}

function startPipeline() {
	var tmpFilename = "/tmp/test.mkv"; // TODO
	var pipeline = new gstreamer.Pipeline(
				"tcpclientsrc protocol=gdp host="+conf.sourceHost+" port="+conf.sourcePort+" !"
				+" queue min-threshold-buffers=60 max-size-buffers=120 !"
				+" gate name=the_gate open=false !"
				+" queue max-size-buffers=300 max-size-bytes=100000000 !"
				+" ffmpegcolorspace !"
				+" ffenc_mjpeg !"
				+" rate update=.5 dump=false post-message=true name=encoded !"
				+" matroskamux !"
				+" filesink sync=false location="+tmpFilename
//				+" fakesink"
			);

	gate = pipeline.findChild("the_gate");

	pipeline.pollBus( function(msg) {
		switch( msg.type ) {
			case "eos": 
				console.log("End of Stream");
				pipeline.stop();
				
				var frames = gate.get("frames");
				submitFile( tmpFilename, frames, node.closeat, function() {
					setTimeout( startPipeline, 100 );
				} );
				break;
			case "error":
				console.log("GStreamer error with",msg.name,":",msg.debug);
			case "application":
				switch( msg.name ) {
					case "rate":
						node.fps = msg.fps;
						node.Bps = msg.Bps;
						node.lastUpdate = new Date();
						break;
					default:
						console.log("unhandled gst application message",msg);
				}
				break;
			case "state-changed":
			case "async-done":
			case "new-clock":
			case "GST_STREAM_STATUS_TYPE_CREATE":
			case "GST_STREAM_STATUS_TYPE_ENTER":
				// ignore
				break; 
			default:
				console.log("unhandled gst message",msg);
		}
	});

	pipeline.play();
}

startPipeline();

function reply( res, reply ) {
	res.writeHead(200, {
					"Content-Type":	"text-plain",
					"Cache-Control":"no-cache"
					});
	res.end(reply+"\n");
}

function getWallclockTimestamp() {
	var t = new Date().getTime();
	t %= (60*60*24*1000);	
	t/=1000;
	return t;
}

function parseTime( s ) {
	var t = getWallclockTimestamp();
	s = unescape(s);
	if( s.length>3 && s.substring(0,3)==="now" ) {
		s = s.substring(3);
		t += parseFloat(s);
	} else {
		t = parseFloat(s);
	}
	return t;
}

connect.createServer(
//	connect.logger(),
	connect.router( function(app) {
			app.get("/open", function(req,res,next){
				var rq = url.parse(req.url,true).query;
				var t = parseTime(rq.t);
				var name = unescape(rq.name);
				console.log("open @"+t+" by "+name );

				if( gate ) {
					node.recording=true;
					node.openedBy=name;
					gate.set("openat", t);
					reply(res,"ok");
				} else {
					reply(res,"no gate");
				}
			}),
			app.get("/close", function(req,res,next){
				var rq = url.parse(req.url,true).query;
				var t = parseTime(rq.t);
				var name = unescape(rq.name);
				if( name == node.openedBy ) {
					console.log("close @"+t+" by "+name );

					if( gate ) {
						node.recording=false;
						node.closeat = t;
						gate.set("closeat", t);
						reply(res,"ok");
					} else {
						reply(res,"no gate");
					}
				} else {
					console.log("opened by "+node.openedBy+", not closing by "+name );
					reply(res,"not closed");
				}
			}),
			app.get("/info", function(req,res,next){
				reply(res,JSON.stringify(node));
			})
		}),
	function( req,res,next ) {
		res.writeHead(404, {"Content-Type":"text-plain"});
		res.end( "no such resource\n" );
	},
	connect.errorHandler({ dumpExceptions: true })
).listen(4230);

