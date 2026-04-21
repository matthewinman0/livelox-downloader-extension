
chrome.webRequest.onBeforeRequest.addListener(
	async (details) => {
		if (details.method !== 'GET' || !details.url.includes('class-storage'))
			return;
	
		const tab = await chrome.tabs.get(details.tabId);
		if (!tab || !tab.url || !tab.url.startsWith('https://www.livelox.com/Viewer/'))
			return;

		const data = {
			url: details.url,
			tabId: details.tabId,
			timestamp: details.timeStamp
		}
		
		await chrome.storage.local.set({ classStorage: data });
		console.log('Captured map data:', await chrome.storage.local.get('classStorage'));
	},
	{
		urls: ["https://livelox.blob.core.windows.net/class-storage/*"]
	}
);
