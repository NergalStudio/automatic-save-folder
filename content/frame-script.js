// Frame script
function getPageInfo()
{
	console.log("ASF:message triggered");
	sendAsyncMessage("asf@mangaheart.org:page-info-loaded", {
    pageLocation : content.document.location,
    pageReferrer : content.document.referrer
    });
}
function remove_all_events()
{
	removeMessageListener("asf@mangaheart.org:get-page-info", getPageInfo);
	removeMessageListener("asf@mangaheart.org:remove-event-listener", remove_all_events); // remove itself
	console.log("ASF:frame-script deleted");
}
console.log("ASF:frame installed");
addMessageListener("asf@mangaheart.org:get-page-info", getPageInfo);
addMessageListener("asf@mangaheart.org:remove-event-listener", remove_all_events);