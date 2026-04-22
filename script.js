const api = {
  async request(path, method = "GET", body) {
    const options = { method, headers: { "Content-Type": "application/json" } };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Request failed.");
    }
    return data;
  },
  loginUser(payload) {
    return this.request("/api/login", "POST", payload);
  },
  getParties() {
    return this.request("/api/parties");
  },
  submitVote(payload) {
    return this.request("/api/vote", "POST", payload);
  },
  getResults() {
    return this.request("/api/results");
  },
  getSettings() {
    return this.request("/api/settings");
  },
  updateSettings(payload) {
    return this.request("/api/settings", "PUT", payload);
  }
};

function saveCurrentUser(user) {
  localStorage.setItem("currentUser", JSON.stringify(user));
}

function getCurrentUser() {
  const raw = localStorage.getItem("currentUser");
  return raw ? JSON.parse(raw) : null;
}

function clearCurrentUser() {
  localStorage.removeItem("currentUser");
}
const navLinks = document.querySelectorAll(".nav-link");
const sections = document.querySelectorAll("main section");
const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

function activateTab(planetId) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.planet === planetId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.id === `${planetId}-panel`;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
}

tabButtons.forEach((button) => {
  button.setAttribute("tabindex", button.classList.contains("active") ? "0" : "-1");

  button.addEventListener("click", () => {
    activateTab(button.dataset.planet);
  });

  button.addEventListener("keydown", (event) => {
    const buttons = Array.from(tabButtons);
    const currentIndex = buttons.indexOf(button);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % buttons.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    if (nextIndex !== currentIndex) {
      event.preventDefault();
      buttons[nextIndex].focus();
      activateTab(buttons[nextIndex].dataset.planet);
    }
  });
});

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const targetSelector = link.getAttribute("href");
    const target = document.querySelector(targetSelector);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => {
        const isActive = link.getAttribute("href") === `#${entry.target.id}`;
        link.classList.toggle("active", isActive);
      });
    });
  },
  { rootMargin: "-40% 0px -50% 0px", threshold: 0.01 }
);

sections.forEach((section) => sectionObserver.observe(section));
