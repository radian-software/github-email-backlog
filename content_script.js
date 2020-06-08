const RUN_PERIOD_MS = 5000; //6 * 3600 * 1000;

async function shouldRun() {
  const { timestamp: lastTimestamp } = await new Promise((resolve) =>
    chrome.storage.sync.get(["timestamp"], resolve)
  );
  const curTimestamp = new Date().getTime();
  if (
    !Number.isInteger(lastTimestamp) ||
    curTimestamp - lastTimestamp >= RUN_PERIOD_MS
  ) {
    await new Promise((resolve) =>
      chrome.storage.sync.set({ timestamp: curTimestamp }, resolve)
    );
    return true;
  } else {
    return false;
  }
}

async function getUsername() {
  const resp = await fetch(`https://github.com/`, {
    credentials: "same-origin",
  });
  if (!resp.ok) {
    throw new Error(
      `bad response from GitHub: ${resp.status} ${resp.statusText}`
    );
  }
  const html = await resp.text();
  const userRegex = /<meta name="user-login" content="(.+?)">/g;
  const { value: match, done: noMatches } = html.matchAll(userRegex).next();
  if (noMatches) {
    throw new Error("couldn't find username in GitHub response");
  } else {
    return match[1];
  }
}

async function getToken({ username }) {
  const resp = await fetch(`https://github.com/${username}`, {
    credentials: "same-origin",
  });
  if (!resp.ok) {
    throw new Error(
      `bad response from GitHub: ${resp.status} ${resp.statusText}`
    );
  }
  const html = await resp.text();
  const tokenRegex = /\/users\/status.+name="authenticity_token" value="(.+?)"/g;
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
    credentials: "same-origin",
  });
  if (!resp.ok) {
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

async function getNotifications({ before, token }) {
  let url = "https://api.github.com/notifications?all=true";
  if (before) {
    url += `&before=${before}`;
  }
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
  let curPage = await getNotifications({ token });
  let all = curPage;
  let ids = new Set(all.map((n) => n.id));
  while (countUnreadFraction(curPage) > 0.1) {
    const before = curPage[curPage.length - 1].updated_at;
    curPage = await getNotifications({ token, before });
    for (const n of curPage) {
      if (!ids.has(n.id)) {
        all.push(n);
      }
    }
  }
  return all;
}

chrome.storage.sync.get(["token"], ({ token }) => {
  getAllNotifications({ token }).then(console.log).catch(console.error);
});
