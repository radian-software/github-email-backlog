async function getUsername({ token }) {
  const resp = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (!resp.ok) {
    throw new Error(
      `bad response from GitHub: ${resp.status} ${resp.statusText}`
    );
  }
  return (await resp.json()).login;
}

async function getToken({ username }) {
  const resp = await fetch(`https://github.com/${username}`);
  if (!resp.ok) {
    throw new Error(
      `bad response from GitHub: ${resp.status} ${resp.statusText}`
    );
  }
  const html = await resp.text();
  if (html.includes("radon.neon@gmail.com")) {
    console.log("We have successfully authenticated");
  } else {
    console.error("We have NOT authenticated");
  }
  const tokenRegex =
    /\/users\/status.+name="authenticity_token" value="(.+?)"/g;
  const { value: match, done: noMatches } = html.matchAll(tokenRegex).next();
  if (noMatches) {
    throw new Error("couldn't find authenticity token in GitHub response");
  } else {
    return match[1];
  }
}

async function setStatus({ token, message, emoji, busy }) {
  const form = new FormData();
  form.append("_method", "put");
  form.append("authenticity_token", token);
  form.append("emoji", `:${emoji}:`);
  form.append("message", message);
  form.append("limited_availability", busy ? "1" : "0");
  const resp = await fetch("https://github.com/users/status", {
    method: "POST",
    body: form,
  });
  if (!resp.ok) {
    console.log(await resp.text());
    throw new Error(
      `bad response from GitHub: ${resp.status} ${resp.statusText}`
    );
  }
}

function getOldestTimestamp(notifications) {
  let oldestTimestamp = null;
  for (const notification of notifications) {
    if (!oldestTimestamp || notification.updated_at < oldestTimestamp) {
      oldestTimestamp = notification.updated_at < oldestTimestamp;
    }
  }
  return oldestTimestamp;
}

async function getNotifications({ token, pageNum }) {
  pageNum = pageNum || 1;
  let url = `https://api.github.com/notifications?all=true&page=${pageNum}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
    },
  });
  if (!resp.ok) {
    throw new Error(
      `bad response from GitHub: ${resp.status} ${resp.statusText}`
    );
  }
  return await resp.json();
}

function countUnreadFraction(notifications) {
  return notifications.filter((n) => n.unread).length / notifications.length;
}

async function getAllNotifications({ token }) {
  console.log("Fetching notifications (page 1) ...");
  let curPage = await getNotifications({ token });
  let all = [...curPage];
  let pageNum = 2;
  while (countUnreadFraction(curPage) > 0.1) {
    console.log(`Fetching notifications (page ${pageNum}) ...`);
    curPage = await getNotifications({ token, pageNum });
    all = all.concat(curPage);
    pageNum += 1;
  }
  all.sort(({ updated_at: a }, { updated_at: b }) => {
    if (a < b) return +1;
    if (a > b) return -1;
    return 0;
  });
  return all;
}

function estimateResponseTimeDays(notifications) {
  const percentile =
    notifications[
      Math.floor(countUnreadFraction(notifications) * notifications.length)
    ];
  const age = new Date().getTime() - new Date(percentile.updated_at).getTime();
  return (age / 86400 / 1000) * 1.5;
}

function getStatus(numDays) {
  if (numDays >= 3) {
    return {
      message: `Estimated inbox backlog: about ${Math.floor(numDays)} days`,
      emoji: "inbox_tray",
      busy: true,
    };
  } else {
    return {
      message: `Estimated inbox backlog: a few days`,
      emoji: "kiwi_fruit",
      busy: false,
    };
  }
}

async function pingWebhook(webhook) {
  const resp = await fetch(webhook);
  if (resp.ok) {
    console.log("Notified webhook");
  } else {
    console.log(
      `Got error response from webhook: ${resp.status} ${resp.statusText}`
    );
  }
}

async function updateStatus() {
  const { token: apiToken } = await new Promise((resolve) =>
    chrome.storage.sync.get(["token"], resolve)
  );
  if (typeof apiToken !== "string" || apiToken.length !== 40) {
    console.log(
      "Not updating GitHub status as API token is missing or malformed"
    );
    return;
  }
  const notifications = await getAllNotifications({ token: apiToken });
  console.log(`Fetched ${notifications.length} notifications`);
  const numDays = estimateResponseTimeDays(notifications);
  console.log(`Estimated response time: ${Math.floor(numDays)} days`);
  const status = getStatus(numDays);
  console.log("Determining username ...");
  const username = await getUsername({ token: apiToken });
  console.log("Fetching CSRF token for profile status form ...");
  const csrfToken = await getToken({ username });
  console.log("Updating GitHub status ...");
  await setStatus({ token: csrfToken, ...status });
  console.log("Successfully updated GitHub status ...");
  const { webhook } = await new Promise((resolve) =>
    chrome.storage.sync.get(["webhook"], resolve)
  );
  if (typeof webhook !== "string" || !webhook) {
    console.log("Webhook is missing or malformed, skipping ping");
  } else {
    await pingWebhook(webhook);
  }
}

// https://developer.chrome.com/extensions/webRequest
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const requestHeaders = details.requestHeaders.filter(
      (header) => header.name !== "Origin"
    );
    requestHeaders.push({
      name: "Origin",
      value: "https://github.com",
    });
    return {
      requestHeaders,
    };
  },
  { urls: ["<all_urls>"] },
  ["blocking", "requestHeaders", "extraHeaders"]
);

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("refresh", {
    periodInMinutes: 3 * 60,
    when: Date.now(),
  });
});

chrome.alarms.onAlarm.addListener(() => {
  updateStatus().catch(console.error);
});
