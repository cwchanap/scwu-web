<script lang="ts">
  import { onMount } from 'svelte';
  import { getMe, signInGoogle, signOut, type ProfileUser } from '../auth/api';
  import { back } from '../instructions/page';

  interface GoogleIdentity {
    accounts: {
      id: {
        initialize(config: {
          client_id: string;
          callback: (response: { credential?: string }) => void;
        }): void;
        renderButton(
          element: HTMLElement,
          options: {
            theme?: string;
            size?: string;
            text?: string;
            shape?: string;
            width?: number;
          },
        ): void;
      };
    };
  }

  const clientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const google = () => (window as { google?: GoogleIdentity }).google;

  let me = $state<ProfileUser | null>(null);
  let loaded = $state(false);
  let exchangeFailed = $state(false);
  let signOutFailed = $state(false);
  let gisReady = $state(false);
  let gisFailed = $state(false);
  let gisButton = $state<HTMLDivElement>();

  const refresh = async () => {
    me = await getMe();
    loaded = true;
  };

  const exchange = async (response: { credential?: string }) => {
    if (!response.credential) return;
    exchangeFailed = (await signInGoogle(response.credential)) === null;
    await refresh();
  };

  const leave = async () => {
    if (await signOut()) {
      signOutFailed = false;
      await refresh();
    } else {
      signOutFailed = true;
    }
  };

  const loadGis = () =>
    new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

  onMount(() => {
    if (!clientId) return;
    void refresh();
    void loadGis().then((ok) => {
      if (ok && google() && clientId) {
        google()!.accounts.id.initialize({
          client_id: clientId,
          callback: exchange,
        });
        gisReady = true;
      } else {
        gisFailed = true;
      }
    });
  });

  $effect(() => {
    const button = gisButton;
    if (!gisReady || me || !button) return;
    button.replaceChildren();
    google()!.accounts.id.renderButton(button, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width: 260,
    });
  });

  const since = $derived.by(() => {
    if (!me) return '';
    const date = new Date(me.createdAt);
    return Number.isNaN(date.getTime())
      ? me.createdAt
      : date.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        });
  });
</script>

<div class="topbar">
  <a class="back" href={import.meta.env.BASE_URL} onclick={back}
    >◂ Back to game</a
  >
</div>

<div class="shell">
  <aside class="side">
    <div class="card">
      {#if me?.avatarUrl}
        <img
          class="avatar"
          src={me.avatarUrl}
          alt=""
          referrerpolicy="no-referrer"
        />
      {:else}
        <div class="avatar placeholder" aria-hidden="true">
          {me ? me.name.charAt(0).toUpperCase() : '?'}
        </div>
      {/if}
      <p class="who">{me ? me.name : 'Not signed in'}</p>
      {#if !clientId}
        <p class="unavailable">Sign-in unavailable</p>
      {:else if me}
        <button class="signout" type="button" onclick={leave}>Sign out</button>
        {#if signOutFailed}
          <p class="failed">Sign-out failed — try again.</p>
        {/if}
      {:else if loaded}
        <div class="gis" bind:this={gisButton}></div>
        {#if gisFailed}
          <p class="failed">Google sign-in couldn't load.</p>
        {:else if exchangeFailed}
          <p class="failed">Sign-in failed — try again.</p>
        {/if}
      {:else}
        <p class="unavailable">Checking sign-in…</p>
      {/if}
    </div>
    <nav class="pagenav" aria-label="Profile">
      <a href="profile.html" aria-current="page">Profile</a>
    </nav>
  </aside>

  <main>
    <h2><span>Profile</span></h2>
    {#if me}
      <div class="panel">
        <dl class="rows">
          <div class="row">
            <dt>Name</dt>
            <dd>{me.name}</dd>
          </div>
          <div class="row">
            <dt>Signed in with</dt>
            <dd>Google</dd>
          </div>
          <div class="row">
            <dt>Playing since</dt>
            <dd>{since}</dd>
          </div>
        </dl>
      </div>
    {:else if clientId}
      <div class="panel">
        <p class="empty">
          Sign in with Google to see your name, sign-in provider and the day you
          started playing.
        </p>
      </div>
    {:else}
      <div class="panel">
        <p class="empty">
          Sign-in unavailable — this deployment has no Google sign-in
          configured.
        </p>
      </div>
    {/if}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 32px;
    max-width: 1240px;
    margin: 0 auto;
    padding: 14px 20px 64px;
    align-items: start;
  }

  .side {
    position: sticky;
    top: 12px;
  }
  .card {
    padding: 22px 20px 24px;
    text-align: center;
    background: var(--ink);
    border-top: 5px solid var(--gold);
    clip-path: polygon(0 16px, 16px 0, 100% 0, 100% 100%, 0 100%);
  }
  .avatar {
    width: 96px;
    height: 96px;
    margin: 0 auto;
    border-radius: 50%;
    object-fit: cover;
    background: var(--navy-2);
  }
  .placeholder {
    display: grid;
    place-items: center;
    font: italic 900 40px/1 var(--display);
    color: var(--steel);
  }
  .who {
    margin-top: 14px;
    font: italic 900 22px/1.15 var(--display);
    color: #fff;
    overflow-wrap: anywhere;
  }
  .unavailable {
    margin-top: 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
  }
  .signout {
    margin-top: 16px;
    padding: 9px 26px;
    border: 0;
    cursor: pointer;
    font: 700 14px/1 var(--body);
    color: var(--ink);
    background: linear-gradient(#ffe36a, var(--gold) 50%, var(--ember));
    clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  }
  .gis {
    display: grid;
    place-items: center;
    min-height: 40px;
    margin-top: 16px;
  }
  .failed {
    margin-top: 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ember);
  }

  .pagenav {
    margin-top: 14px;
    background: var(--ink);
    border-top: 5px solid var(--steel);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 16px 100%, 0 calc(100% - 16px));
  }
  .pagenav a {
    display: block;
    padding: 12px 18px;
    font: italic 900 17px/1 var(--display);
    color: var(--muted);
    text-decoration: none;
  }
  .pagenav a[aria-current] {
    padding-left: 13px;
    border-left: 5px solid var(--gold);
    color: var(--gold);
  }

  .rows {
    display: grid;
    margin: 0;
    border-left: 5px solid var(--steel);
    background: #071733f2;
  }
  .row {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    gap: 18px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--edge);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .row:nth-child(even) {
    background: #0d2750f2;
  }
  dt {
    font-weight: 700;
    color: var(--steel);
  }
  dd {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    overflow-wrap: anywhere;
  }
  .empty {
    padding: 18px;
    border-left: 5px solid var(--steel);
    background: #071733f2;
    color: #d7e3f1;
  }

  @media not all and (min-width: 900px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
    .side {
      position: static;
    }
  }
  @media (max-width: 700px) {
    h2 {
      font-size: 24px;
    }
    .row {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
