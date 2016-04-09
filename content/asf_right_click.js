/* ***** BEGIN LICENSE BLOCK *****
Automatic Save Folder
Copyright (C) 2007-2012 Éric Cassar (Cyan).
			  2009 Ted Gifford - Dynamic variable capturing 

    "Automatic Save Folder" is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    "Automatic Save Folder" is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with "Automatic Save Folder".  If not, see <http://www.gnu.org/licenses/>.

 * ***** END LICENSE BLOCK ***** */
var asf_rightclick_loaded;

var automatic_save_folder = {
	prefManager: Components.classes["@mozilla.org/preferences-service;1"]
						.getService(Components.interfaces.nsIPrefBranch),
						
	appInfo: Components.classes["@mozilla.org/xre/app-info;1"]
						.getService(Components.interfaces.nsIXULAppInfo),
					
	versionChecker: Components.classes["@mozilla.org/xpcom/version-comparator;1"]
						.getService(Components.interfaces.nsIVersionComparator),
				
	firefoxversion : "",
	logtoconsole: true,
	inPrivateBrowsing: false,
	importantVersionAlert: "1.0.5bRev116",
	result: "", // print_r result
	previousASFVersion: "",
	currentASFVersion : "",
	current_uri: "", // FF7.0.1 use a new per uri saved folder.
	
	rightclick_init: function() {
		if (!asf_rightclick_loaded) 
		{
			asf_rightclick_loaded = true;
			this.checkFirefoxVersion();
			
			this.checkASFVersion();
			
			// After installation or upgrade, show a message if needed.
			this.show_update_message();
			
			// check and modify preferences structure if needed 
			this.preference_structure_changes();
			
			// Right-click feature doesn't work on Firefox 2 (Can't detect installed add-on and prevent conflict with Download Sort)
			if (this.firefoxversion >= 3)
			{
				// Replace original Right-click menu with ASF Right-click menu
				// Not compatible with Download Sort extension (Dsort rewrites the whole function, it will conflict with ASF).
				// Detect if Download Sort is installed and enabled, and activate ASF rightclick only if DSort is not already loaded.
				if (!this.DownloadSort_isEnabled())  // Download Sort is not enabled, load ASF rightclick replacement && Firefox 2.0 min
				{
					// adding ASF filtering function at the beginning of the getTargetFile function.
					// Code from Paolo Amadini, MAF add-on developer. Thank you !
					if (window.getTargetFile) 
					{
						// Save a reference to the original function
						var original_getTargetFile = window.getTargetFile;
						// Override the original function
						window.getTargetFile = function() 
						{
							// Call our function before the original one
							automatic_save_folder.rightclick_main.apply(automatic_save_folder, arguments);
							// Execute the original function and propagate the return value
							return original_getTargetFile.apply(window, arguments);
						}
					}
					if (window.promiseTargetFile) 
					{
						// Save a reference to the original function
						var original_getTargetFile = window.promiseTargetFile;
						// Override the original function
						window.promiseTargetFile = function() 
						{
							// Call our function before the original one
							automatic_save_folder.rightclick_main.apply(automatic_save_folder, arguments);
							// Execute the original function and propagate the return value
							return original_getTargetFile.apply(window, arguments);
						}
					}
					
					// Starting from firefox 3.0 there is a timeout when downloading with right-click to read header(Content-Disposition:) to rename the file in the file_explorer suggested filename.
					// When timeout is set to 1000 ms (default), ASF right-click filtering is not working.
					// When timeout is set to 0ms, ASF right-click filtering is working, but header renaming is not working anymore.
					// And when set to ~8ms, Header renaming is working but ASF is filtering on the previous filename (before the renaming).
					
					// Set to 0 only when the user want to use it
					var asf_rightclicktimeout = this.prefManager.getBoolPref("extensions.asf.rightclicktimeout");
					this.prefManager.setIntPref("browser.download.saveLinkAsFilenameTimeout", asf_rightclicktimeout == true ? 0 : 1000);
				}
			}
		}
	},
	
	
	rightclick_main: function(aFpP) {
		
		//check if the rightclick filtering is enabled
		var userightclick = this.prefManager.getBoolPref("extensions.asf.userightclick");
		if (userightclick)
		{
			//alert ("debug full uri : "+aFpP.fileInfo.uri.spec);
			//alert("ok");
			
			// Setting private variables usable in this function
			var prefManager = this.prefManager;
			
			// load the domain and the filename of the saved file
			var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
							   .getService(Components.interfaces.nsIWindowMediator);
			var mainWindow = wm.getMostRecentWindow("navigator:browser");
						
			// Check if the user is in PrivateBrowsing mode.
			if (this.versionChecker.compare(this.appInfo.version, "3.5") >= 0)// nsIPrivateBrowsingService supported from FF3.5 to FF20
			{
				
				// Firefox 3.5 to 20.x
				if(this.versionChecker.compare(this.appInfo.version, "21.0") < 0)
				{
					var pbs = Components.classes["@mozilla.org/privatebrowsing;1"]
										.getService(Components.interfaces.nsIPrivateBrowsingService);
					this.inPrivateBrowsing = pbs.privateBrowsingEnabled;						
				}
				
				// Firefox 21 to 31
				if(this.versionChecker.compare(this.appInfo.version, "21.0") >= 0 &&
					this.versionChecker.compare(this.appInfo.version, "32.0") < 0)
				{
					this.inPrivateBrowsing = mainWindow.gBrowser.docShell.QueryInterface(Components.interfaces.nsILoadContext).usePrivateBrowsing;
				}
				
				// Firefox 32 and newer (tested up to 43)
				if(this.versionChecker.compare(this.appInfo.version, "32.0") >= 0)
				{
					try
					{
						var PBU = {};
						Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm", PBU);
					
						if (PBU.PrivateBrowsingUtils.isWindowPrivate(window)) 
						{
							this.inPrivateBrowsing = true;
						}
					}
					catch(e)
					{
						this.inPrivateBrowsing = false;
					}
				}
							
				Components.utils.import("resource://gre/modules/DownloadLastDir.jsm");
				
				// since 2012-07-21 gDownloadLastDir uses a per-window privacy status instead of global service. (https://bugzilla.mozilla.org/show_bug.cgi?id=722995 ; https://hg.mozilla.org/mozilla-central/rev/03cd2ad254cc)
				if (typeof(gDownloadLastDir) != "object")
				{
					var gDownloadLastDir = {}; // Create the gDownloadLastDir object because it doesn't exist
					var downloadModule = {};
					Components.utils.import("resource://gre/modules/DownloadLastDir.jsm", downloadModule);
					gDownloadLastDir = new downloadModule.DownloadLastDir(mainWindow); // Load gDownloadLastDir for the active window
				}
			}
				
			var tabURL = mainWindow.gURLBar.value;
			var tabGroupName = this.getActiveGroupName();
			var currentReferrer = mainWindow.gBrowser.mCurrentTab.linkedBrowser.contentDocument.referrer;
			
			var tabLocation = 	mainWindow.gBrowser.mCurrentTab.linkedBrowser.contentDocument.location;
			var currentDomain = tabLocation.protocol + "//" + tabLocation.host; // look for the current website domain in the DOM.
			var currentURL = 	tabLocation.href; // look for the current website URL in the DOM.
			var filename = aFpP.fileInfo.fileName; // filename or tab's name if no filename specified.
			if (typeof(aFpP.fileInfo.uri.fileName) != "undefined") // if the download is from an URL
			{
				var domain = 					aFpP.fileInfo.uri.scheme+"://"+aFpP.fileInfo.uri.host;
				var	domainWithoutProtocol =    	aFpP.fileInfo.uri.host;
				var fileURL = 					aFpP.fileInfo.uri.prePath+aFpP.fileInfo.uri.directory; 
				var fileURLAndFilename=			aFpP.fileInfo.uri.prePath+aFpP.fileInfo.uri.path;
			}
			else //  If the saved data is not from an URL (example : Abduction! add-on), use current URL and tab's name.
			{
				var domain = currentDomain;
				var domainWithoutProtocol =  domain.replace(/^.*:\/\//g,'');  // remove the protocol name from the domain
				var fileURL = "";
				var fileURLAndFilename = domain+"/"+filename;
			}
			
			//if (this.firefoxversion >= 7.01) this.current_uri = domain.replace(/^.*:\/\//g,'');
			// Firefox's Right-click function seems to use the current website's domain and not current file URL's domain
			if (this.firefoxversion >= 7.01) this.current_uri = currentDomain.replace(/^.*:\/\//g,''); 
			
			var domain_testOrder = prefManager.getCharPref("extensions.asf.domainTestOrder");
			if (this.trim(domain_testOrder) == "") domain_testOrder = "1,5";
					var message = "These data will be used to verify the filters :\n"+
							"Filename:\t\t"+filename+"\nDomain test order:\t"+domain_testOrder+"\n"+
							"1 - File's domain:\t"+domain+"\n"+
							"2 - File's URL:\t\t"+fileURL+"\n"+
							"3 - Full file's URL:\t"+fileURLAndFilename+"\n"+
							"4 - Page's domain:\t"+currentDomain+"\n"+
							"5 - Page's URL:\t\t"+currentURL+"\n"+
							"6 - Page's referrer:\t"+currentReferrer+"\n"+
							"7 - Tab's URL content:\t"+tabURL+"\n"+
							"8 - Tab's group name:\t"+tabGroupName;
			if (!this.inPrivateBrowsing) this.console_print(message);
			
			
			// For Ctrl+S, if pagename.ext is not on the URL document.title is used as filename, add .htm to the filename
			var page_title = document.title.replace(" - Mozilla Firefox", "");
			if (filename == page_title) filename = filename+".htm";
			
			
			// load prefmanager data
			var savetype = 			prefManager.getIntPref("extensions.asf.savetype");
			var lastdir = 			prefManager.getBoolPref("extensions.asf.lastdir");
			var defaultfolder = 	this.loadUnicodeString("extensions.asf.defaultfolder");
			var keeptemp = 			prefManager.getBoolPref("extensions.asf.keeptemp");
			var tempdomain = 		this.loadUnicodeString("extensions.asf.tempdomain");
			var variable_mode = 	prefManager.getBoolPref("extensions.asf.variablemode");
			var findNearestParent = prefManager.getBoolPref("extensions.asf.findNearestParent");
			
			// If variable/Dynamic folders mode is ON, let's check the variables and replace to create the new defaultfolder
			if (variable_mode == true) 
			{
				defaultfolder = this.createfolder(aFpP, defaultfolder);
			}
			
			// set the last folder path used into asf.lastpath
			if (this.firefoxversion >= 3)   // take the download.lastDir if it's FF3
			{
				var folder = this.loadUnicodeString("browser.download.lastDir");
			}
			else // else if it's not FF3 (it's 1.5 or 2), read Download.dir
			{
				var folder = this.loadUnicodeString("browser.download.dir");
			}
			this.saveUnicodeString("extensions.asf.lastpath", folder); // And set it to asf.lastpath to be compared later with the new path the filters will set to lastDir (or dir)
			
			
			// load filters data from prefmanager into filters[]
			// filters[filternumber][label]
			var nbrfilters = 	prefManager.getIntPref("extensions.asf.filtersNumber");
			var filters = new Array();
			for ( var i = 0 ; i < nbrfilters ; i++)
			{
				var dom = this.loadUnicodeString("extensions.asf.filters"+ i +".domain");
				var fil = this.loadUnicodeString("extensions.asf.filters"+ i +".filename");		
				var fol = this.loadUnicodeString("extensions.asf.filters"+ i +".folder");		
				var act = prefManager.getBoolPref("extensions.asf.filters"+ i +".active");	
				var dom_reg = prefManager.getBoolPref("extensions.asf.filters"+ i +".domain_regexp");
				var fil_reg = prefManager.getBoolPref("extensions.asf.filters"+ i +".filename_regexp");
				filters[i] = [dom, fil, fol, act, dom_reg, fil_reg];
			}
			
			
			// 
			// Start checking the filters with the downloaded file
			//
			var idx = -1 ;
			var dom_regexp = false;
			var file_regexp = false;
			for ( var i = 0 ; i < filters.length ; i++)
			{
				if (filters[i][3] == true)  // if not temporary deactivated
				{
					dom_regexp = false ; // reset the matching string for the "for" loop
					file_regexp = false ; // same as above
				// Check the domain	
				var domain_testOrder = prefManager.getCharPref("extensions.asf.domainTestOrder");
				if (this.trim(domain_testOrder) == "") domain_testOrder = "1,5";
				domain_testOrder = domain_testOrder.split(/,/);
				
				for ( var j = 0 ; j < domain_testOrder.length ; j++)
				{
					switch (this.trim(domain_testOrder[j])) 
					{
						case "1":
							dom_regexp = this.test_regexp(filters[i][0], domain, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 1");
							break;
						case "2":
							dom_regexp = this.test_regexp(filters[i][0], fileURL, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 2");
							break;
						case "3":
							dom_regexp = this.test_regexp(filters[i][0], fileURLAndFilename, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 3");
							break;
						case "4":
							dom_regexp = this.test_regexp(filters[i][0], currentDomain, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 4");
							break;
						case "5":
							dom_regexp = this.test_regexp(filters[i][0], currentURL, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 5");
							break;
						case "6":
							dom_regexp = this.test_regexp(filters[i][0], currentReferrer, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 6");
							break;
						case "7":
							dom_regexp = this.test_regexp(filters[i][0], tabURL, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 7");
							break;
						case "8":
							dom_regexp = this.test_regexp(filters[i][0], tabGroupName, i, "domain");
							if (dom_regexp && this.logtoconsole && !this.inPrivateBrowsing) this.console_print("Filter "+i+" matched domain type : 8");
							break;
						default:
					}
					
					if (dom_regexp) break;
				}
				
				// Check the filename
					file_regexp = this.test_regexp(filters[i][1], filename, i, "filename"); // Filename
					
					// debug
					// alert ("i = "+i+"\n domain match = "+dom_regexp+"\n file match = "+file_regexp);
					if (dom_regexp && file_regexp)
					{
						var idx = i;
						if (this.logtoconsole && !this.inPrivateBrowsing)  this.console_print("Filter "+idx+" is matching both domain and filename.\nDomain:\t\t"+filters[i][0]+"\nFilename:\t"+filters[i][1]+"\nFolder:\t\t"+filters[i][2]);
						break;
					}
				}
			} // end filters loop
			
			if (idx < 0) // if no filters matched
			{
				if (this.logtoconsole && !this.inPrivateBrowsing)  this.console_print("No filter matched both domain and filename. These data will be used instead :\nFolder:\t\t"+this.loadUnicodeString("extensions.asf.defaultfolder")+"\n%asf_d%:\t"+domainWithoutProtocol+"\n%asf_f%:\t"+filename);
				
				if(savetype == 1)  // and folder is set to user choice
				{
					if ( (keeptemp == false) || ((keeptemp == true) && ( tempdomain != domain )) ) // and, if [same domain not checked] OR [ if same domain (keeptemp) is checked and domain not same as previous one]
					{	// then change the destination folder to user choice
						this.set_savepath(defaultfolder);
					}	
					else  // else, if domain is the same as the last, and the user checked "use the same folder if same domain"
					{
						if (this.firefoxversion >= 3)
						{
							var lastpath = this.loadUnicodeString("browser.download.lastDir");
						}
						if (this.firefoxversion == 2)
						{
							var lastpath = this.loadUnicodeString("browser.download.dir");
						}
						
						if (lastpath == "") // if no path is returned (first time using lastDir, or the user reseted the content manually in about:config)
						{
							lastpath = defaultfolder;
						}
						this.set_savepath(lastpath);
					}
				}
				else // else, if savetype == 0  (folder is set to last folder)
				{
					if (this.firefoxversion >= 3)
					{
						var lastpath = this.loadUnicodeString("browser.download.lastDir");
					}
					if (this.firefoxversion == 2)
					{
						var lastpath = this.loadUnicodeString("browser.download.dir");
					}
					
					if (lastpath == "") // if no path is returned (first time using lastDir, or the user reseted the content manually in about:config)
					{
						lastpath = defaultfolder;
					}
					if (this.firefoxversion >= 7.01 && this.prefManager.getBoolPref("extensions.asf.useSiteBySiteSavePath") == true)
					{
						var file = gDownloadLastDir.getFile(this.current_uri);
						if (file != null) lastpath = file.path;
					}
					if (findNearestParent) lastpath = this.find_nearestParent(lastpath);
					this.set_savepath(lastpath);
				}
			}
			else // if a filter is found 
			{
				var folder = filters[idx][2];
				
				// If Advanced mode is ON, let's check the variables and create the folder
				if (variable_mode == true) 
				{
					folder = this.createfolder(aFpP, folder, idx);
				}
				
				this.set_savepath(folder);
			}
			
			// in every case, set the new file hosted domain to tempdomain if not in private browsing
			if (!this.inPrivateBrowsing)
			{
				this.saveUnicodeString("extensions.asf.tempdomain", domain);
			}
		}
		
	},
	
	
	set_savepath: function(path) {
		var folderList = this.prefManager.getIntPref("browser.download.folderList");	
		var lastdir = this.prefManager.getBoolPref("extensions.asf.lastdir");	     // for Firefox2 : set save as Ctrl+S too
		var directory = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
		
		// since 2012-07-21 gDownloadLastDir uses a per-window privacy status instead of global service.
		if (this.versionChecker.compare(this.appInfo.version, "3.5") >= 0 && typeof(gDownloadLastDir) != "object")
		{
			var downloadModule = {};
			var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
							   .getService(Components.interfaces.nsIWindowMediator);
			var mainWindow = wm.getMostRecentWindow("navigator:browser");
			Components.utils.import("resource://gre/modules/DownloadLastDir.jsm", downloadModule);
			gDownloadLastDir = new downloadModule.DownloadLastDir(mainWindow);
		}
		
		if (!path) 
		{
			directory = Components.classes["@mozilla.org/file/directory_service;1"]
								.getService(Components.interfaces.nsIProperties)
								.get("Desk", Components.interfaces.nsILocalFile);
		}
		else
		{
			directory.initWithPath(path);
		}
		
		
		if (this.firefoxversion == 2)
		{
		
		this.saveUnicodeString("browser.download.dir", directory.path);
		if (lastdir)
			this.saveUnicodeString("browser.download.lastDir", directory.path);		
		}
		
		if (this.firefoxversion >= 3)
		{
			if (this.inPrivateBrowsing && directory)
			{
				gDownloadLastDir.file = directory;
			}
			else
			{	
				this.saveUnicodeString("browser.download.lastDir", directory.path);
				if (folderList == 2)
					this.saveUnicodeString("browser.download.dir", directory.path);
			}
		}
		
		if (this.firefoxversion >= 7.01)
		{
			// Firefox 7.0.1 use a new feature to memorize last used folder on a site-by-site basis.
			// Replace the memorized folder for the current website's URI.
			var uri = this.current_uri;
			// var file = gDownloadLastDir.getFile(uri);
			// alert("uri="+uri+"\noldpath ="+file.path+"\nnewpath ="+directory.path);
			gDownloadLastDir.setFile(uri, directory);
		}
		
		if (this.logtoconsole && !this.inPrivateBrowsing) this.console_print("save location for "+uri+" changed to: "+directory.path);
	},
	
	
	loadUnicodeString: function (pref_place) {
		try 
		{
			return this.prefManager.getComplexValue(pref_place, Components.interfaces.nsISupportsString).data;
		}
		catch (e)
		{ }
		return "";
	},
	
	
	saveUnicodeString: function (pref_place,pref_data) {
		var str = Components.classes["@mozilla.org/supports-string;1"]
					.createInstance(Components.interfaces.nsISupportsString);
		str.data = pref_data;
		this.prefManager.setComplexValue(pref_place, Components.interfaces.nsISupportsString, str);
	},	
	
	
	find_nearestParent: function(path) {
	
		/* test if the path exists. If it doesn't exist then returns first existing parent. */
		var directory = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
		directory.initWithPath(path);
		while (!directory.exists() && directory.parent != null)
		{
			directory = directory.parent;
		}
		return directory.path;
	},
	
	
	createfolder: function (aFpP, path, idx) {
		
		if (!path) return false;
		if (this.trim(path).length==0) return false;
		
		var Date_asf = Date;
		Date_asf.prototype.getWeek = function() // Add the getWeek() function do date()
		{
			var onejan = new Date(this.getFullYear(),0,1);
			var week = Math.ceil((((this - onejan) / 86400000) + onejan.getDay()-1)/7);
			if (onejan.getDay() > 4) week--;  // if the first week does not contain a thrusday, it's not the first week (and return as week 0)
			return week;
		}
		var objdate = new Date_asf();
		
		// make the array with the month's name in the stringbundle of the locale language path.
		
		var stringbundle = Components.classes['@mozilla.org/intl/stringbundle;1'].
											getService(Ci.nsIStringBundleService).  
								createBundle('chrome://asf/locale/asf.properties');
		
		var fullmonthname = new Array();
		var abbrmonthname = new Array();
		var fulldayname = new Array();
		var abbrdayname = new Array();
		for (var i = 1 ; i<= 12 ; i++)
		{
			fullmonthname[i-1] = stringbundle.GetStringFromName("month"+i+"_full");
			abbrmonthname[i-1] = stringbundle.GetStringFromName("month"+i+"_abbr");
		}
		for (var i = 0 ; i<= 6 ; i++)
		{
			fulldayname[i] = stringbundle.GetStringFromName("day"+i+"_full");
			abbrdayname[i] = stringbundle.GetStringFromName("day"+i+"_abbr");
		}
		
		
		const ZERO = "0";  // leading zero
		
		// load the domain and the filename of the saved file	
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						   .getService(Components.interfaces.nsIWindowMediator);
		var mainWindow = wm.getMostRecentWindow("navigator:browser");
		
		var tabURL = mainWindow.gURLBar.value;
		var tabGroupName = this.getActiveGroupName();
		var currentReferrer = mainWindow.gBrowser.mCurrentTab.linkedBrowser.contentDocument.referrer;
		
		var tabLocation = 	mainWindow.gBrowser.mCurrentTab.linkedBrowser.contentDocument.location;
		var currentDomain = tabLocation.protocol + "//" + tabLocation.host; // look for the current website URL in the DOM.
		var currentURL = 	tabLocation.href; // look for the current website URL in the DOM.
		var filename = aFpP.fileInfo.fileName; // filename or tab's name if no filename specified.
		var file_name = aFpP.fileInfo.fileBaseName ;
		var extension = filename.match(/([^\.]*)$/i);  // take out the extension (anything not containing a dot, with an ending line)
		if (typeof(aFpP.fileInfo.uri.fileName) != "undefined") // if the download is from an URL
		{
			var domain = 					aFpP.fileInfo.uri.scheme+"://"+aFpP.fileInfo.uri.host;
			var	domainWithoutProtocol =    	aFpP.fileInfo.uri.host;
			var fileURL = 					aFpP.fileInfo.uri.prePath+aFpP.fileInfo.uri.directory; 
			var fileURLAndFilename=			aFpP.fileInfo.uri.prePath+aFpP.fileInfo.uri.path;
		}
		else //  If the saved data is not from an URL (example : Abduction! add-on), use current URL and tab's name.
		{
			var domain = currentDomain;
			var domainWithoutProtocol =  domain.replace(/^.*:\/\//g,'');  // remove the protocol name from the domain
			var fileURL = "";
			var fileURLAndFilename = domain+"/"+filename;
		}
		
		
		// check the filter's data
		var asf_domain = "";
		var asf_filename = "";
		if (idx >= 0) // If a filter match
		{  
			asf_domain = this.loadUnicodeString("extensions.asf.filters"+ idx +".domain");
			asf_filename = this.loadUnicodeString("extensions.asf.filters"+ idx +".filename");
		}
		else // no filter is found, use actual Domain and filename without extension
		{
			asf_domain = domainWithoutProtocol;
			asf_filename = filename;
		}
		
		// check the domain
		var used_domain_string = "";
		var dom_regexp = false;
		var domain_testOrder = this.prefManager.getCharPref("extensions.asf.domainTestOrder");
		if (this.trim(domain_testOrder) == "") domain_testOrder = "1,5";
		domain_testOrder = domain_testOrder.split(/,/);
		
		for ( var j = 0 ; j < domain_testOrder.length ; j++)
		{
			switch (this.trim(domain_testOrder[j])) 
			{
				case "1":
					dom_regexp = this.test_regexp(asf_domain, domain, idx, "domain");
					used_domain_string = domain;
					break;
				case "2":
					dom_regexp = this.test_regexp(asf_domain, fileURL, idx, "domain");
					used_domain_string = fileURL;
					break;
				case "3":
					dom_regexp = this.test_regexp(asf_domain, fileURLAndFilename, idx, "domain");
					used_domain_string = fileURLAndFilename;
					break;
				case "4":
					dom_regexp = this.test_regexp(asf_domain, currentDomain, idx, "domain");
					used_domain_string = currentDomain;
					break;
				case "5":
					dom_regexp = this.test_regexp(asf_domain, currentURL, idx, "domain");
					used_domain_string = currentURL;
					break;
				case "6":
					dom_regexp = this.test_regexp(asf_domain, currentReferrer, idx, "domain");
					used_domain_string = currentReferrer;
					break;
				case "7":
					dom_regexp = this.test_regexp(asf_domain, tabURL, idx, "domain");
					used_domain_string = tabURL;
					break;
				case "8":
					dom_regexp = this.test_regexp(asf_domain, tabGroupName, idx, "domain");
					used_domain_string = tabGroupName;
					break;
				default:
			}
			
			if (dom_regexp) break;
		}
		
		// Check the filename
		var file_regexp = this.test_regexp(asf_filename, filename, idx, "filename"); 
		
// Ted Gifford, start block
		// String capture in filename with $<1-9>f
		try {
		//alert(file_regexp.length);
			if (file_regexp.length > 1)
			{
				//alert('munging path: ' + path);
				for (var replace_index = 1; replace_index < file_regexp.length; ++replace_index)
						path = path.replace("$"+replace_index+"f", file_regexp[replace_index]);
				//alert('munged path: ' + path);
			}
		} catch (e) {alert(e);}
		// String capture in domain with $<1-9>d
		try {
		//alert(dom_regexp.length);
			if (dom_regexp.length > 1)
			{
				//alert('munging path: ' + path);
				for (var replace_index = 1; replace_index < dom_regexp.length; ++replace_index)
						path = path.replace("$"+replace_index+"d", dom_regexp[replace_index]);
				//alert('munged path: ' + path);
			}
		} catch (e) {alert(e);}
// Ted Gifford, end block
		
		
		// read the userpref to define if regexp is case insensitive (default true)
		var param = "";
		var regexp_caseinsensitive = this.prefManager.getBoolPref("extensions.asf.regexp_caseinsensitive");
		if (regexp_caseinsensitive) param = "i";
		
		// Check if asf_rd is present and process     asf_rd = Regexp the domain
		if (path.search("%asf_rd%") != -1)
		{
			// extract the filter part
			var matches = path.match(/%asf_rd%.*?%asf_rd%/g);        // matches is an array
			if (matches != null)
			{
				var datareg = "";
				var result = new Array();
				var matchreplace = new Array();
				for (var i = 0, len = matches.length; i < len; i++) 
				{
					datareg = matches[i].replace(/%asf_rd%/g, '');  // remove the %asf_rf% to keep only the regexp
					datareg = new RegExp(datareg, param);			//  create the regexp
					//alert("reg="+datareg);
					result = used_domain_string.match(datareg);    // Check it on the domain type set by the user
					
					if (result == null) 
					{
						matchreplace[i] = ""; // if no result, replace with nothing instead of null
					}
					else
					{
						matchreplace[i] = result[0];
					}
					//alert("matchreplace["+i+"]="+matchreplace[i]);
				}
				for (var i = 0, len = matches.length; i < len; i++) 
				{
					path = path.replace(matches[i], matchreplace[i]);  // replace each variable in the path
				}
			}
		}
		
		
		// Check if asf_rf is present and process     asf_rf = Regexp the filename
		if (path.search("%asf_rf%") != -1 )
		{
			// extract the filter part
			var matches = path.match(/%asf_rf%.*?%asf_rf%/g);        // matches is an array
			if (matches != null)
			{
				var datareg = "";
				var result = new Array();
				var matchreplace = new Array();
				for (var i = 0, len = matches.length; i < len; i++) 
				{
					datareg = matches[i].replace(/%asf_rf%/g, '');  // remove the %asf_rf% to keep only the regexp
					datareg = new RegExp(datareg, param);			//  create the regexp
					//alert("reg="+datareg);
					result = filename.match(datareg);    // Check it
					
					if (result == null) 
					{
						matchreplace[i] = ""; // if no result, replace with nothing instead of null
					}
					else
					{
						matchreplace[i] = result[0];
					}
					//alert("matchreplace["+i+"]="+matchreplace[i]);
				}
				for (var i = 0, len = matches.length; i < len; i++) 
				{
					path = path.replace(matches[i], matchreplace[i]);  // replace each variable in the path
				}
			}
		}
		
		
		
		// remove special characters from filters :
		// forbidden on windows  \ / : * ? " < > | 
		if (navigator.appVersion.indexOf("Win")!=-1) // = Windows
		{
			asf_domain = asf_domain.replace(/[\/\:\*\?\"\<\>\|]/g,'');
			asf_filename = asf_filename.replace(/[\/\:\*\?\"\<\>\|]/g,'');
			file_name = file_name.replace(/[\/\:\*\?\"\<\>\|]/g,'');
			path = path.replace(/\//g,'\\'); // if the user captured subdomains, then replace them with windows' sub-folders
			path = path.replace(/[\*\?\"\<\>\|]/g,'');
		}
		else  // MacOS and linux, replace only  / :
		{
			asf_domain = asf_domain.replace(/[\/\:]/g,'');
			asf_filename = asf_filename.replace(/[\/\:]/g,'');
			file_name = file_name.replace(/[\/\:]/g,'');
			
			// Do I need to replace subdomains "/" by sub-folders ":" for Mac?
		}
		
		// replace the string here		// Year
			path = path					.replace(/%Y%/g, objdate.getFullYear())  // full year format = 2009
										.replace(/%y%/g, ((objdate.getYear()-100) <10) ? (ZERO + (objdate.getYear()-100)) : objdate.getYear()-100)  // year in YY format : 08, 09, 10
									//	.replace(/%<to define>/g, objdate.getYear()-100)  // 8, 9, 10, (no leading 0)
										// Month
										.replace(/%m%/g, ((objdate.getMonth()+1) <10) ? (ZERO + (objdate.getMonth()+1)) : objdate.getMonth()+1)  // = number of the month : 01 to 12
										.replace(/%n%/g, objdate.getMonth()+1)  // 8, 9, 10, (no leading 0)
										.replace(/%F%/g, fullmonthname[objdate.getMonth()])  // full month name
										.replace(/%M%/g, abbrmonthname[objdate.getMonth()])  // abbreviated month name
										// Week
										.replace(/%W%/g, ((objdate.getWeek()) <10) ? (ZERO + (objdate.getWeek())) : objdate.getWeek())  // = number of the week : 01 to 54
										.replace(/%w%/g, objdate.getDay())  // = Day of the week, from 0 (sunday) to 6 (saturday)
										.replace(/%l%/g, fulldayname[objdate.getDay()])  // = Full day name
										.replace(/%D%/g, abbrdayname[objdate.getDay()])  // = Abbreviated day name
										// Day
										.replace(/%d%/g, ((objdate.getDate()) <10) ? (ZERO + (objdate.getDate())) : objdate.getDate())  // = number of the day : 01 to 31
										.replace(/%j%/g, objdate.getDate())  // = number of the day  1 to 31 (no leading 0)
										// ASF
										.replace(/%asf_D%/g, domainWithoutProtocol)       // downloaded File's domain
										.replace(/%asf_F%/g, filename)     // downloaded File's filename with extension
										.replace(/%asf_Fx%/g, file_name)   // downloaded File's filename without extension
										.replace(/%asf_d%/g, asf_domain)   // matching filter's Domain (without special chars used by regexp)
										.replace(/%asf_f%/g, asf_filename) // mathching filter's filename (without special chars used by regexp)
										.replace(/%asf_x%/g, extension[0]);    // match the filename extension (without the dot)
		// debug
		// alert (path);
		return path;
		
// Canceled the folder creation script, so the folder will not be created if the user cancel the download
// Firefox will create it automatically when accepting the download... under windows XP and Linux Ubuntu at least (not tested under Vista, MacOS, or any other operating system)
/* 
		var directory = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
		
		directory.initWithPath(path);     
		if (directory.exists()) 
		{
			return path;
		}
		else  // if it doesn't exist, create it
		{			
			if( !directory.exists() || !directory.isDirectory() )   
			{   
				directory.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0777);
			}
			return path;
		}
*/  
	},
	
	
	trim: function (string) {
		return string.replace(/(^\s*)|(\s*$)/g,'');
	},
	
	
	indexInArray: function (arr,val){
		val = val.replace(/\\/g,'\\\\')
				.replace(/\./gi, "\\.") // thanks ziceptor
				.replace(/\*/gi, "\\*")
				.replace(/\$/gi, "\\$")
				.replace(/\^/gi, "\\^")
				.replace(/\+/gi, "\\+")
				.replace(/\?/gi, "\\?")
				.replace(/\|/gi, "\\|")
				.replace(/\[/gi, "\\[")
				.replace(/\]/gi, "\\]")
				.replace(/\(/gi, "\\(")
				.replace(/\)/gi, "\\)")
				.replace(/\//gi, "\\/");
		var test_regexp = new RegExp("^"+val+"$");
		var data = "";
		for(var i=0;i<arr.length;i++) 
		{
			if(test_regexp.test(arr[i])) return i;
		}
		return -1;
	},
	
	
	test_regexp: function (filter_data, downloaded_data, idx, filter_type) {
	/**
	// filter_data (String) : The filter's content
	// downloaded_data (String) : The downloaded filename or domain informations
	// idx (Int) : Current filter number
	// filter_type (String) : Current filter type, can be "domain" of "filename".
	// Return (Array) : return false, or the result as an Array [downloaded_data [, captured group1 [, ... [, captured group9]]]]
	*/
		// replace normal filter to regular expression filter.
		var isregexp = false;
		if(idx >= 0)
		{
			if (filter_type == "domain") isregexp = this.prefManager.getBoolPref("extensions.asf.filters"+ idx +".domain_regexp");
			if (filter_type == "filename") isregexp = this.prefManager.getBoolPref("extensions.asf.filters"+ idx +".filename_regexp");
		}
		if (isregexp == false) // replace simple wildcard and special characters with corresponding regexp
		{
			filter_data = filter_data.replace(/\./gi, "\\.")
													.replace(/\*/gi, ".*")
													.replace(/\$/gi, "\\$")
													.replace(/\^/gi, "\\^")
													.replace(/\+/gi, "\\+")
													.replace(/\?/gi, ".")
													.replace(/\|/gi, "\\|")
													.replace(/\[/gi, "\\[")
													.replace(/\]/gi, "\\]")
													.replace(/\//gi, "\\/");
			filter_data = ".*"+filter_data+".*";
		}
		
		// initialize the regular expression search
		var param = (this.prefManager.getBoolPref("extensions.asf.regexp_caseinsensitive") == true ? "i" : "");
		try 
		{
			var test = new RegExp(filter_data, param);
		}
		catch(e){
		
			// try to fix parentheses if not used for catching purpose (odd number of parentheses). currently replacing all instances, breaking existing catches.
			filter_data = filter_data.replace(/\(/gi, "\\(")
									 .replace(/\)/gi, "\\)");
			
			try
			{
				test = new RegExp(filter_data, param);
			}
			catch(e){
				alert('\t\tAutomatic Save Folder\n\n-'+e.message+'\nin filter N°'+idx+':\n'+filter_data+'\nregular expression: '+isregexp)
			}
		}
		
		// Thanks to Ted Gifford for the regular expression capture.
		var res = downloaded_data.match(test);
		if (res) return res;
		return false;
	},
	
	
	is_regexp: function (string) { // Not used anymore ASF>r90, but needed to convert older filters to new format.
		if ((string.substring(0,1) == "/") && (string.substr(string.length - 1, 1) == "/"))
		{
			return true;
		}
		else
		{
			return false;
		}
	},
	
	
	checkFirefoxVersion: function() {
		
		if (this.versionChecker.compare(this.appInfo.version, "7.0.1") >= 0)
		{
			this.firefoxversion = 7.01;
		}
		else if (this.versionChecker.compare(this.appInfo.version, "4.0b1") >= 0)
		{
			this.firefoxversion = 4;
		}
		else if(this.versionChecker.compare(this.appInfo.version, "3.0") >= 0) 
		{
			this.firefoxversion = 3;
		}
		else 
		{
			this.firefoxversion = 2;
		}
	},
	
	
	// get TabGroup name, from https://hg.mozilla.org/mozilla-central/rev/b284e10652d3
	getActiveGroupName: function () {
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						   .getService(Components.interfaces.nsIWindowMediator);
		var mainWindow = wm.getMostRecentWindow("navigator:browser");
		
		// We get the active group this way, instead of querying
		// GroupItems.getActiveGroupItem() because the tabSelect event
		// will not have happened by the time the browser tries to
		// update the title.
		let groupItem = null;
		let activeTab = mainWindow.gBrowser.selectedTab;
		let activeTabItem = activeTab._tabViewTabItem;
		
		if (activeTab.pinned)
		{
			// It's an app tab, so it won't have a .tabItem.
			groupItem = null; // I didn't find how to get the Active Group's Name.
		}
		else if (activeTabItem)
		{
			groupItem = activeTabItem.parent;
		}
		
		// groupItem may still be null, if the active tab is an orphan.
		return groupItem ? groupItem.getTitle() : "";
	},
	
	
	DownloadSort_isEnabled: function() {
		// Check for Download sort add-on, if enabled return true. 
		
		if (this.firefoxversion >= 4)
		{
			var enabledItems = this.prefManager.getCharPref("extensions.enabledAddons");
		}
		if (this.firefoxversion == 3)
		{
			var enabledItems = this.prefManager.getCharPref("extensions.enabledItems");
		}
		
		var addon_GUUID = "D9808C4D-1CF5-4f67-8DB2-12CF78BBA23F";
		var DownloadSort = enabledItems.indexOf(addon_GUUID,0);
		if (DownloadSort >= 0) return true;
	
		return false;
	},
	
	
	readHiddenPref: function(pref_place, type, ret) {
		if(this.prefManager.getPrefType(pref_place))
		{
			switch (type)
			{
				case "bool": return this.prefManager.getBoolPref(pref_place);
				case "int" : return this.prefManager.getIntPref(pref_place);
				case "char": return this.prefManager.getCharPref(pref_place);
				case "complex": return this.prefManager.getComplexValue(pref_place, Components.interfaces.nsISupportsString).data;
			}
		}
		else
		{
			return ret; // return default value if pref doesn't exist
		}
	},
	
	
	print_r: function (Obj) {
		if(Obj.constructor == Array || Obj.constructor == Object)
		{
			for(var p in Obj)
			{
				if(Obj[p].constructor == Array|| Obj[p].constructor == Object)
				{
					this.result = this.result + "<li>["+p+"] =>"+typeof(Obj)+"</li>";
					this.result = this.result + "<ul>";
					this.print_r(Obj[p]);
					this.result = this.result + "</ul>";
				}
				else 
				{
					this.result = this.result + "<li>["+p+"] =>"+Obj[p]+"</li>";
				}
			}
		}
		return this.result;
	},
	
	
	console_print : function (aMessage) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                 .getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage("Automatic Save Folder : \n" + aMessage);
	},
	
	
	checkASFVersion: function() {
	
		if(this.prefManager.getPrefType("extensions.asf.version") == 0) // not present
		{
			this.prefManager.setCharPref("extensions.asf.version", "1.0.0")
		}
		
		this.previousASFVersion = this.prefManager.getCharPref("extensions.asf.version");
		this.currentASFVersion = this.prefManager.getCharPref("extensions.asf.currentVersion");
	},
	
	
	show_update_message: function() {
		
		var show_update_message = false;
		var	messageType = "update";
		var previous_version = this.previousASFVersion;	
		
		// show the update message in a new tab on important notices
		var notice_version = this.importantVersionAlert; // latest important release, needing a notice
		if(this.versionChecker.compare(notice_version, previous_version) > 0)  // if an important version occured since the last installed version
		{
			show_update_message = true;
		}
		
		// show the update message in a new tab on first install
		if(previous_version == "1.0.0" && this.prefManager.getPrefType("extensions.asf.filters0.active") == 0) // first install, no filter set
		{
			show_update_message = true;
			messageType = "install";
		}
		
		if (show_update_message)
		{
			var gBrowser = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					 .getService(Components.interfaces.nsIWindowMediator).getMostRecentWindow("navigator:browser").getBrowser();
			setTimeout(function(messageType)
			{
				gBrowser.selectedTab = gBrowser.addTab("chrome://asf/content/help/"+messageType+".xhtml");
			},
			500,
			messageType);
		}
	},
	
	
	preference_structure_changes: function(version) {
		
		if (this.versionChecker.compare(this.previousASFVersion, "1.0.2bRev86") == -1) this.upgrade("1.0.2bRev86"); // convert currenturl to 1,5
		if (this.versionChecker.compare(this.previousASFVersion, "1.0.2bRev90") == -1) this.upgrade("1.0.2bRev90"); // remove the slashes to regexp
		if (this.versionChecker.compare(this.previousASFVersion, "1.0.5bRev116") == -1) this.upgrade("1.0.5bRev116"); // copy useDownloadDir preference
		// write the current version as old to prevent showing the updateMessage again
		this.previousASFVersion = this.currentASFVersion;
		this.prefManager.setCharPref("extensions.asf.version", this.currentASFVersion);
	
	},
	
	
	upgrade: function(version) {
		switch(version)
		{
			case "1.0.2bRev86": // convert extensions.asf.usecurrentURL=true to extensions.asf.domainTestOrder=1,5
				
				if(this.prefManager.getPrefType("extensions.asf.usecurrenturl") == 128) // Bool=128
				{
					if (this.prefManager.getBoolPref("extensions.asf.usecurrenturl"))
					{
						this.prefManager.setCharPref("extensions.asf.domainTestOrder", "1,5"); 
					}
					this.prefManager.deleteBranch("extensions.asf.usecurrenturl"); // remove old preference
				}
			break;
			
			case "1.0.2bRev90": // remove / / from regular expression filters, and create separate settings to read the regular expression state.
				
				var prefs = Components.classes["@mozilla.org/preferences-service;1"].
									getService(Components.interfaces.nsIPrefService);
				
				var filter_number = 0;
				var filter_childs = 0;
				var value = "";
				var branch = "";
				while (1)
				{
					branch = "extensions.asf.filters"+filter_number+".";
					filter_childs = prefs.getBranch(branch).getChildList("", {});
					if(filter_childs.length)
					{
						value = this.prefManager.getCharPref(branch+"domain");
						this.prefManager.setBoolPref(branch+"domain_regexp", this.is_regexp(value)); // create the regexp value
						if (this.is_regexp(value)) // convert the current data
						{
							value = value.substring(1, value.length);
							value = value.substring(0, value.length -1);
							if (value == ".*") 
							{
								value = "*";
								this.prefManager.setBoolPref(branch+"domain_regexp", false);
							}
							this.prefManager.setCharPref(branch+"domain", value);
						}
						
						value = this.prefManager.getCharPref(branch+"filename");
						this.prefManager.setBoolPref(branch+"filename_regexp", this.is_regexp(value)); // create the regexp value
						if (this.is_regexp(value)) // convert the current data
						{
							value = value.substring(1, value.length);
							value = value.substring(0, value.length -1);
							if (value == ".*") 
							{
								value = "*";
								this.prefManager.setBoolPref(branch+"filename_regexp", false);
							}
							this.prefManager.setCharPref(branch+"filename", value);
						}
						filter_number++;
					}
					else
					{
						break;
					}
				}
			break;
			
			case "1.0.5bRev116": // // copy useDownloadDir to extensions.asf.useDownloadDir

				this.prefManager.setBoolPref("extensions.asf.useDownloadDir", this.prefManager.getBoolPref("browser.download.useDownloadDir")); 
			break;
			

		}
	},
	
	
}
	
	addEventListener( // Autoload
	"load",			// After browser window is loaded
	function(){ automatic_save_folder.rightclick_init(); },  // Run main from automatic_save_folder to check the filters
	false
	);