//use this on students.yale.edu/facebook. in the console.

(async () => {
  const step = 12;
  const found = [...document.documentElement.innerHTML.matchAll(/currentIndex=(\d+)/g)]
    .map(m => Number(m[1]));
  const max = Math.max(...found);

  const popup = window.open(location.href, "yaliesCollector", "width=900,height=700");
  if (!popup) throw new Error("Allow popups and retry");

  const pages = [];

  for (let index = 0; index <= max; index += step) {
    const target = `${location.origin}/facebook/PhotoPageNew?currentIndex=${index}`;
    popup.location.href = target;

    await new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        try {
          if (
            popup.document.readyState === "complete" &&
            popup.location.href === target
          ) {
            clearInterval(timer);
            resolve();
          }
        } catch {}

        if (Date.now() - started > 60000) {
          clearInterval(timer);
          reject(new Error(`Timed out at index ${index}`));
        }
      }, 250);
    });

    const html = popup.document.documentElement.outerHTML;
    const count = popup.document.querySelectorAll(".student_container").length;
    console.log({ index, count });

    if (!count) break;
    pages.push({ index, html });
    await new Promise(r => setTimeout(r, 500));
  }

  popup.close();

  const blob = new Blob([JSON.stringify(pages)], {
    type: "application/json"
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "yalies-facebook-pages.json";
  a.click();
  URL.revokeObjectURL(a.href);

  console.log(`Downloaded ${pages.length} pages`);
})();