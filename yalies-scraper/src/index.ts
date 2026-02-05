import DirectorySource from "./sources/directory.js";
import FacebookSource from "./sources/facebook.js";

console.log("Welcome to the scraper");

const directorySource = new DirectorySource();
const facebookSource = new FacebookSource();

async function scrapeAll() {
	const task = Promise.all([
		directorySource.scrape(),
		facebookSource.scrape(),
	]);
	await task;
}

scrapeAll();
