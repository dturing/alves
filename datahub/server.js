#!/usr/bin/env node

var connect = require("connect");
var util = require("util");
var http = require("http");
var url = require("url");
var exec = require('child_process').exec;
var fs = require("fs");
var mysql = require('mysql');

var conf = require("../config.js").datahub;

var node = {
	session:conf.defaultSessionName
};

function createTables(db, callback) {
  db.query('CREATE TABLE IF NOT EXISTS clip ('
  		+' id INT(10) AUTO_INCREMENT, '
	  	+' filename VARCHAR(64), '
	  	+' session VARCHAR(64), '
	  	+' camera VARCHAR(64), '
	  	+' trig VARCHAR(64), '
	  	+' tags VARCHAR(64), '
	  	+' date DATETIME, '
	  	+' duration INT(10), '
	  	+' PRIMARY KEY (id) '
	  	+ ') ;',
  	function( err ) {
    	if( err ) throw(err);
    	if( callback ) callback();
    });
}

var db = mysql.createConnection({
	host:		conf.db.host,
    user: 		conf.db.user,
    password: 	conf.db.password
});
db.on("error",function(err) {
	console.log('Database Error: ' + err);
});
db.query("USE "+conf.db.name);

createTables( db );

function submit( data ) {
	// run thumbnailer
	if( !data.session ) data.session = node.session;
	console.log("insert "+util.inspect(data) );
	
	var ext = data.filename.split(".").pop();
	console.log("thumbnail "+conf.dataPath+"/"+data.filename );
	exec(
		"totem-video-thumbnailer -s 80 -t 1 -j "
		+conf.dataPath+"/"+data.filename+" "
		+conf.dataPath+"/"+data.filename+".jpg",
		function( err, stdout, stderr ) {
			if( err ) console.log("thumbnail error: "+err );
			else {
				db.query("INSERT INTO clip (filename,session,camera,trig,tags,date,duration) VALUES ("
					+"'"+data.filename+"',"
					+"'"+data.session+"',"
					+"'"+data.camera+"',"
					+"'"+data.trig+"',"
					+"'"+data.tags+"',"
					+"'"+data.date+"',"
					+"'"+data.frames+"')");
			}
		});
}

function createClause( rq, select ) {
	// FIXME: sql injection vulnerabilities DELUXE!

	var cond = [];
	var orderBy = "RAND()";
	var order = "ASC";
	var limit = 25;
	
	for( field in rq ) {
		var val = rq[field];
		switch( field ) {
			case "limit":
				limit=val;
				break;
				
			case "shorter-than":
				cond.push("duration<"+(parseFloat(val)*25));
				break;
			case "longer-than":
				var v = parseFloat(val);
				if( v>0 ) cond.push("duration>="+(v*25));
				break;

			case "before":
				cond.push('date<"'+val+'"');
				break;
			case "after":
				cond.push('date>"'+val+'"');
				break;
			
			case "older-than":
				cond.push('date<TIMESTAMPADD(MINUTE,-'+val+',NOW())');
				//strftime("%s","now","-'+val+' minute")');
				break;
			case "newer-than":
				cond.push('date>TIMESTAMPADD(MINUTE,-'+val+',NOW())');
				break;
				
			case "near":
				select.push('ABS(TIMESTAMPDIFF(SECOND,date,"'+(val.split("_").join(" "))+'")) AS delta');
				//cond.push("delta>0"); // not this exact time.
				orderBy = "delta";
				break;
				
			case "order":
				switch( val ) {
					case "date":
						orderBy = "date";
						break;
					case "duration":
						orderBy = "duration";
						break;
					case "random":
						orderBy = "RAND()";
						break;
					default:
						orderBy = val;
						break;
				}
				break;

			case "asc":
				order=val;
				break;
				
			case "trig":
				cond.push("trig like '"+val+"'");
				break;

			case "trigger":
				cond.push("trig like '"+val+"'");
				break;

			case "session":
			case "camera":
				cond.push(field+" like '"+val+"'");
				break;

			case "tag":
				cond.push(field+" like '%"+val+"%'");
				break;
			
			case "time":
			case "live":
				// ignored
				break;

			default:
				console.log("unhandled query field '"+field+"' value '"+val+"' in request "+util.inspect(rq));
		}
	}
	
	if( !cond.length ) cond.push("date>0");
	return { 
		where:cond.join(" AND "),
		order:"ORDER BY "+orderBy+" "+order+" LIMIT "+limit,
		select:select.join(",")
		};
}

connect.createServer(
//	connect.logger(),
	connect.router( function(app) {
			app.get("/info", function(req,res,next){
				var rq = url.parse(req.url,true).query;
				
				res.writeHead(200, {
					"Content-type":	"application/json",
					"Cache-Control":"no-cache"
					});
				res.end( JSON.stringify(
					{ name:"data hub", session:node.session }
					));
			});
			
			app.get("/query", function(req,res,next){
				var rq = url.parse(req.url,true).query;
				if( !rq ) return next();

				res.writeHead(200, {
					"Content-type":	"application/json",
					"Cache-Control":"no-cache"
					});

				var select = ["id","filename","session","camera","trig","tags","m","p","date",
								'DATE_FORMAT(date,"%Y-%m-%d %H:%i:%s") AS readable_date',
							"duration"];
				var qr = createClause(rq,select);

				var q = "SELECT "+qr.select+" FROM clip WHERE "+qr.where+" "+qr.order+";"
				var result = {query:q,clips:[]};
				var a = new Date().getTime();
				var n = 0;
			//	console.log("Q: "+q);
				db.query(q, function(err,rows,cols){
					if( err ) {
						res.end( JSON.stringify( err ) );
					}
					result.clips = rows;
					res.end( JSON.stringify( result ) );
				});
			});

			app.get("/sessions", function(req,res,next){
				res.writeHead(200, {
					"Content-type":	"application/json",
					"Cache-Control":"no-cache"
					});
				var q = "SELECT session, count(*) as count FROM clip GROUP BY session ORDER BY count ;"
				db.query(q, function(err,rows,cols){
					if( err ) {
						res.end( JSON.stringify( err ) );
					}
					res.end( JSON.stringify( rows ) );
				});
			});

			app.get("/submit", function(req,res,next){
				var rq = url.parse(req.url,true).query;
				submit(rq);
				res.writeHead(200, {
					"Content-type":	"text/plain",
					"Cache-Control":"no-cache"
					});
				res.end( "thx" );
			});
			app.get("/batchrename/:newname", function(req,res,next){
				var newname = req.params.newname;
				var rq = url.parse(req.url,true).query;
				var clause = createClause(rq,[]);
				var query = "UPDATE clip SET session='"+escape(newname)+"' WHERE "+clause.where+";";
				db.query( query, function(err){
					if(err) throw(new Error(err));
					
					res.writeHead(200, {
						"Content-type":	"text/plain",
						"Cache-Control":"no-cache"
						});
					res.end( "thx" );
				} );
			});
			app.get("/rename/:id/:newname", function(req,res,next){
				var id = req.params.id;
				var newname = req.params.newname;
				var query = "UPDATE clip SET session='"+escape(newname)+"' WHERE id="+id+";";
				console.log("rename: "+query );
				db.query( query, function(err){
					if(err) throw(new Error(err));
					
					res.writeHead(200, {
						"Content-type":	"text/plain",
						"Cache-Control":"no-cache"
						});
					res.end( "thx" );
				} );
			});
		}),
		
	connect.static( __dirname + "/"+conf.dataPath ),
	connect.errorHandler({ stack: true, dump: true })

).listen( conf.port );

