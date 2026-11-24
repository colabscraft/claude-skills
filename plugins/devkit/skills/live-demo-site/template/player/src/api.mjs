// The app's API from the viewer's browser, on the demo site's own origin
// (live-demo-site skill). A topic's prerequisites are made with it, under the
// seats they belong to, before the frame is signed in as the topic's own seat:
// the session cookie it leaves IS the one the framed app then reads.
//
// Sign-in goes through the demo issuer's seat picker by fetch: the app's
// sign-in start route answers (after its redirects) a page with ONE form whose
// buttons are the seats; the form is posted back with the chosen seat's button,
// exactly as a click would. Every path and name below is an option, with the
// values the first project (Go + an OIDC test issuer) used as defaults.

export class ApiError extends Error {
  constructor(method, path, status, body) {
    const detail = typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 300);
    super(`${method} ${path} -> ${status} ${detail}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * @param appBase  the app's base URL, ending in / (e.g. new URL('app/', location.href).href)
 * @param o.csrfCookie / o.csrfHeader  the double-submit pair the app checks on writes
 * @param o.startPath     the route that starts sign-in (redirects to the issuer)
 * @param o.sessionPath   answers who is signed in (JSON)
 * @param o.logoutPath    POST signs out
 * @param o.userOf        session JSON -> the user, or null
 * @param o.afterSignIn   (api, session) => a step every new session needs (e.g. a privacy notice)
 * @param o.seatButton    (form, label) => the chooser's button for that seat
 */
export function makeApi(appBase, o = {}) {
  const {
    csrfCookie = 'csrftoken', csrfHeader = 'X-CSRFToken',
    startPath = 'api/auth/oidc/start', sessionPath = 'api/auth/session', logoutPath = 'api/auth/logout',
    userOf = (session) => session?.user ?? null,
    afterSignIn = async () => {},
    seatButton = (form, label) => [...form.querySelectorAll('button')].find((b) => b.textContent.trim() === label),
  } = o;
  const url = (path) => new URL(String(path).replace(/^\//, ''), appBase).href;
  const csrf = () => decodeURIComponent(document.cookie.match(new RegExp(`(?:^|;\\s*)${csrfCookie}=([^;]*)`))?.[1] ?? '');

  async function call(method, path, body) {
    const headers = {};
    let payload;
    if (method !== 'GET') headers[csrfHeader] = csrf();
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(url(path), { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store' });
    const text = await res.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* a page, not JSON */ }
    if (!res.ok) throw new ApiError(method, path, res.status, data);
    return data;
  }

  const api = {
    url,
    call,
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    who: null,

    /** Sign in as the seat labelled `label` through the seat picker. */
    async signIn(label) {
      const start = await fetch(url(startPath), { credentials: 'same-origin', cache: 'no-store' });
      const page = new DOMParser().parseFromString(await start.text(), 'text/html');
      const form = page.querySelector('form');
      const button = form && seatButton(form, label);
      if (!button) throw new Error(`the seat picker did not offer "${label}" (${start.status} ${start.url})`);
      const fields = new URLSearchParams();
      for (const input of form.querySelectorAll('input[type=hidden]')) fields.append(input.name, input.value);
      if (button.name) fields.append(button.name, button.value);
      const back = await fetch(new URL(form.getAttribute('action') ?? '', start.url), {
        method: (form.getAttribute('method') ?? 'post').toUpperCase(), body: fields, credentials: 'same-origin', cache: 'no-store',
      });
      const error = new URL(back.url).searchParams.get('error');
      if (error) throw new Error(`sign-in as "${label}" refused: ${error}`);
      const session = await call('GET', sessionPath);
      const user = userOf(session);
      if (!user) throw new Error(`sign-in as "${label}" left no session`);
      await afterSignIn(api, session);
      api.who = user;
      return user;
    },

    async signOut() {
      await call('GET', sessionPath).catch(() => null); // a CSRF cookie first, when there is none
      await call('POST', logoutPath, {});
      api.who = null;
    },

    async upload(blob, { path = 'api/files', field = 'file', name = 'photo.jpg' } = {}) {
      const form = new FormData();
      form.append(field, blob, name);
      return call('POST', path, form);
    },
  };
  return api;
}
