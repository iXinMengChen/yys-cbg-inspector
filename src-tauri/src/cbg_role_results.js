(() => {
  const action = __ACTION__;
  const normalize = (value) =>
    String(value ?? "")
      .replace(/\s+/g, "")
      .trim();
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  };
  const officialHosts = new Set(["yys.cbg.163.com", "cbg.163.com"]);
  let siteNotice;
  try {
    const noticeKey = "yys-cbg-inspector.role-search.site-notice";
    siteNotice = window.sessionStorage.getItem(noticeKey) || undefined;
    if (siteNotice) {
      window.sessionStorage.removeItem(noticeKey);
      window.__yysCbgSearchNoticeObserver?.disconnect();
    }
  } catch {
    // 不影响正常读取商品列表。
  }
  const isRoleSearch =
    location.pathname.includes("/advance/search") ||
    new URLSearchParams(location.search).get("search_type") === "role";

  if (/login|passport|account\/login/i.test(location.pathname))
    return { status: "login_required" };
  if (
    /安全验证|滑动验证|访问异常|风险控制|captcha/i.test(
      document.body?.innerText ?? "",
    )
  )
    return { status: "security_check" };
  if (!isRoleSearch) return { status: "not_role_search", siteNotice };

  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidateUrl, summary = "") => {
    let url;
    try {
      url = new URL(candidateUrl, location.href);
    } catch {
      return;
    }
    const sameHost =
      url.hostname === location.hostname ||
      (officialHosts.has(url.hostname) && officialHosts.has(location.hostname));
    if (
      !sameHost ||
      url.protocol !== "https:" ||
      !/^\/cgi\/mweb\/equip\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    ) {
      return;
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    const key = url.pathname;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      url: url.href,
      summary: String(summary).replace(/\s+/g, " ").trim().slice(0, 500),
    });
  };
  for (const anchor of document.querySelectorAll("a[href]")) {
    if (visible(anchor)) {
      const card = anchor.closest(".product-item");
      addCandidate(anchor.href, card?.innerText || anchor.innerText);
    }
  }
  // 角色卡片不是链接元素，商品编号在 Vue 组件绑定数据中。
  for (const card of document.querySelectorAll(".product-item")) {
    if (!visible(card)) continue;
    const data = card.__vue__?.$options?.propsData?.data;
    const serverid = String(data?.serverid ?? "");
    const ordersn = String(data?.game_ordersn ?? "");
    if (/^\d+$/.test(serverid) && /^[A-Za-z0-9_-]+$/.test(ordersn)) {
      addCandidate(`/cgi/mweb/equip/${serverid}/${ordersn}`, card.innerText);
    }
  }

  const params = new URLSearchParams(location.search);
  const activePage =
    document.querySelector('[aria-current="page"]')?.innerText ??
    document.querySelector(".ant-pagination-item-active")?.innerText ??
    "";
  const pageParam = ["page", "page_index", "pageNo", "page_no", "pageno"]
    .map((key) => params.get(key))
    .find(Boolean);
  let component = document.querySelector(".product-item")?.__vue__;
  const listState = {};
  for (let depth = 0; component && depth < 8; depth += 1) {
    const data = component.$data ?? {};
    if (typeof data.nomore === "boolean") listState.nomore = data.nomore;
    if (typeof data.loading === "boolean") listState.loading = data.loading;
    if (Number.isFinite(data.pageIndex)) listState.pageIndex = data.pageIndex;
    if (Array.isArray(data.list)) listState.listCount = data.list.length;
    component = component.$parent;
  }
  const noResults = /暂无商品|暂无符合条件|没有符合条件|未找到相关商品/.test(
    normalize(document.body?.innerText),
  );
  const pageKey = [
    location.pathname,
    location.search,
    pageParam ?? normalize(activePage),
    listState.pageIndex ?? "",
    listState.listCount ?? "",
    listState.nomore ?? "",
    candidates.length,
    candidates[0]?.url ?? "",
    candidates.at(-1)?.url ?? "",
    noResults ? "empty" : "",
  ].join("|");
  const isDisabled = (element) => {
    let current = element;
    for (let depth = 0; depth < 3 && current; depth += 1) {
      if (
        current.hasAttribute("disabled") ||
        current.getAttribute("aria-disabled") === "true" ||
        /(^|\s)(disabled|is-disabled)(\s|$)/i.test(String(current.className))
      ) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  };
  const nextButton = [...document.querySelectorAll("a,button,[role=button]")]
    .filter(visible)
    .find((element) => {
      const label = normalize(
        [
          element.innerText,
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
        ].join(" "),
      );
      const classes = String(element.className);
      return (
        element.matches('[rel="next"]') ||
        /下一页|下页|next/i.test(label) ||
        /pagination-next|pager-next|next-page/i.test(classes)
      );
    });

  if (action === "next") {
    if (nextButton && !isDisabled(nextButton)) {
      nextButton.click();
      return { status: "clicking", pageKey };
    }
    if (listState.loading) return { status: "waiting", pageKey };
    if (listState.nomore !== false) return { status: "done", pageKey };
    const scrollRoot = document.scrollingElement;
    if (!scrollRoot) return { status: "done", pageKey };
    scrollRoot.scrollTop = scrollRoot.scrollHeight;
    return { status: "scrolling", pageKey };
  }

  return {
    status: candidates.length ? "ready" : noResults ? "empty" : "loading",
    siteNotice,
    pageUrl: location.href,
    pageKey,
    candidates,
    hasNext:
      Boolean(nextButton && !isDisabled(nextButton)) ||
      listState.nomore === false,
  };
})();
