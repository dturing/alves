#!/usr/bin/env node

var util = require("util");
var url = require("url");
var fs = require("fs");
var http = require("http");
var exec = require('child_process').exec;

var conf = require("../config.js").hub;

var appData = {
	nodes:[]
};

fs.readFile( "nodes.json", function( err, data ) {
	if( err ) throw err;
	try {
		appData.nodes = JSON.parse(data);
	} catch(e) {
		console.log("Error parsing nodes.json: "+e);
		data.nodes = {};
	}

	var nodes = appData.nodes
	for( node in nodes ) {
		var n = nodes[node];
		for( service in n.services ) {
			var s = n.services[service];
			s.host = n.host;
		}
	}

});

function poll( n ) {
	var node = n;
	if( node.polling ) {
	} else {
		node.polling = true;
		var client = http.createClient( node.port, node.host );
		var req = client.request("GET","/info",{host:node.host});
		client.on("error",function(e){
			node.status = "OFF";
			node.message = e.message.split(",")[0];
			node.polling = false;
		});
		req.on("response", function(resp){
			var reply = "";
			resp.on("data",function(data) {
				reply += data;
			});
			resp.on("end",function() {
				try {
					node.status="OK";
					node.message="";
					var r = JSON.parse(reply);
					for( a in r ) node[a] = r[a];
				} catch(e) {
					console.log("Error parsing "+node.ip+"'s reply, not a Node? :"+e);
					node.status="ERR";
					node.message="Invalid reply";
				}
				node.polling = false;
			});
		});
		req.end();
	}
}

setInterval( function() {
	var nodes = appData.nodes;
	for( node in nodes ) {
		var services = nodes[node].services;
		for( s in services ) {
			poll( services[s] );
		}
	}
}, 1000 );


var connect = require("connect");
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
				var rq = url.parse(req.url,true).query;
				var limit = rq ? rq.limit : 5;
				
				res.writeHead(200, {
					"Content-type":	"application/json",
					"Cache-Control":"no-cache"
					});
				res.end( JSON.stringify(
					{ name:"control hub" }
					));
			});
			app.get("/data", function(req,res,next){
				reply(res,JSON.stringify(appData));
			});
			app.get("/scripts/:dpy", function(req,res,next){
				fs.readdir("../scripts/"+req.params.dpy, function(err,files) {
					if( err ) {
						console.log("error getting listing of scripts for dpy '"+req.params.dpy+"': "+err );
						reply( res, "" );
					} else
						reply( res, files.join("\n") );
				});
			});
			app.get("/fwd/:host\::port/*", function(req,res,next){
				var rq = url.parse(req.url,true);
				var client = http.createClient( req.params.port, req.params.host );
				var u = "/"+escape(req.params[0])+rq.search;
//			console.log("FWD "+req.params.host+":"+req.params.port+u);
				var req = client.request("GET",u);
				client.on("error",function(e){
					res.writeHead(500, {
									"Content-Type":	"text-plain",
									"Cache-Control":"no-cache"
									});
					res.end(""+e+"\n");
				});
				req.on("response", function(resp){
					res.writeHead(200, {
									"Content-Type":	"text-plain",
									"Cache-Control":"no-cache"
									});
					resp.on("data",function(data) {
						res.write(data);
					});
					resp.on("end",function() {
						res.end();
					});
				});
				req.end();
			});
		}),
	connect.static( conf.dataPath ),
	connect.static( "client" ),
	function( req,res,next ) {
		res.writeHead(404, {"Content-Type":"text-plain"});
		res.end( "no such resource\n" );
	},
	connect.errorHandler({ dumpExceptions: true })
).listen( conf.port );

console.log("ALVES hub running on "+conf.host+":"+conf.port );

