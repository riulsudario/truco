<!--
  Avatar editor: disabled for now (out of the menu and without a route). To turn it back on,
  restore the /boneco route in App and send loadMyAvatar() in the hello and in practice.
-->
<script lang="ts">
  import { AVATAR_OPTIONS, type Avatar } from '@truco/protocol'
  import { fromName, saveMyAvatar } from '../lib/avatars'
  import { t } from '../lib/strings'
  import AvatarSprite from './AvatarSprite.svelte'

  interface Props {
    avatar: Avatar
    onsave: (avatar: Avatar) => void
    onback: () => void
  }

  let { avatar, onsave, onback }: Props = $props()

  // The editor works on a copy; it only stores on save.
  // svelte-ignore state_referenced_locally
  let draft = $state<Avatar>({ ...avatar })

  const FIELDS: { field: keyof Avatar; label: string; when?: (a: Avatar) => boolean }[] = [
    { field: 'body', label: t.avatar.body },
    { field: 'skin', label: t.avatar.skin },
    { field: 'hair', label: t.avatar.hair },
    {
      field: 'hairColor',
      label: t.avatar.hairColor,
      when: (a) => a.hair !== 'bald' || a.facialHair !== 'none',
    },
    { field: 'facialHair', label: t.avatar.facialHair },
    { field: 'glasses', label: t.avatar.glasses },
    { field: 'hat', label: t.avatar.hat },
    { field: 'hatColor', label: t.avatar.hatColor, when: (a) => a.hat === 'bandana' },
    { field: 'shirt', label: t.avatar.shirt },
    { field: 'shirtColor', label: t.avatar.shirtColor },
    { field: 'pants', label: t.avatar.pants },
    { field: 'pantsColor', label: t.avatar.pantsColor },
    { field: 'voice', label: t.avatar.voice },
  ]

  function choose<K extends keyof Avatar>(field: K, value: Avatar[K]) {
    draft[field] = value
  }

  function surprise() {
    draft = fromName(`${Date.now()}-${Math.random()}`)
  }

  function save() {
    saveMyAvatar(draft)
    onsave({ ...draft })
  }
</script>

<main class="editor">
  <header>
    <button class="btn" onclick={onback}>← {t.back}</button>
    <h2>{t.avatar.title}</h2>
  </header>

  <!-- Preview as at the table: seated, from the front and from the side. -->
  <div class="preview">
    <AvatarSprite avatar={draft} facing="front" scale={3} />
    <AvatarSprite avatar={draft} facing="left" scale={2} />
  </div>

  <div class="fields">
    {#each FIELDS as { field, label, when } (field)}
      {#if !when || when(draft)}
        <fieldset class="field">
          <legend>{label}</legend>
          <div class="chips">
            {#each Object.entries(AVATAR_OPTIONS[field]) as [id, option] (id)}
              <label class="chip" class:on={draft[field] === id}>
                <input
                  type="radio"
                  name={field}
                  checked={draft[field] === id}
                  onchange={() => choose(field, id as Avatar[typeof field])}
                />{option.label}
              </label>
            {/each}
          </div>
        </fieldset>
      {/if}
    {/each}
  </div>

  <footer>
    <button class="btn" onclick={surprise}>🎲 {t.avatar.random}</button>
    <button class="btn primary big" onclick={save}>{t.save}</button>
  </footer>
</main>

<style>
  .editor {
    display: grid;
    gap: 14px;
    max-width: 560px;
    margin: 0 auto;
    padding: 16px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h2 {
    margin: 0;
    color: var(--gold);
    font-size: 18px;
  }
  .preview {
    overflow: hidden;
    display: flex;
    justify-content: center;
    align-items: end;
    gap: 8px;
    background: var(--felt-pattern), var(--felt);
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 var(--ink);
    padding: 4px 0;
  }
  .fields {
    display: grid;
    gap: 12px;
  }
  .chip {
    font-size: 14px;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
</style>
