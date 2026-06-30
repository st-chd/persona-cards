import {
    characters,
    chat_metadata,
    default_user_avatar,
    eventSource,
    event_types,
    getCurrentChatId,
    getRequestHeaders,
    getThumbnailUrl,
    name2,
    saveMetadata,
    saveSettingsDebounced,
    setUserName,
} from '../../../../script.js';
import { groups } from '../../../group-chats.js';
import { getCurrentLocale } from '../../../i18n.js';
import { getUserAvatar, getUserAvatars, initPersona, setPersonaDescription, user_avatar } from '../../../personas.js';
import { POPUP_RESULT, POPUP_TYPE, Popup } from '../../../popup.js';
import { power_user } from '../../../power-user.js';
import { world_names } from '../../../world-info.js';
import {
    createPersonaCard,
    embedPersonaCardInPng,
    extractPersonaCardFromPng,
    validatePersonaCard,
} from './card-format.js';

const EXTENSION_ID = 'persona-cards';
const EXPORT_CONTROL_ID = `${EXTENSION_ID}-export`;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SAFE_AVATAR_EXTENSIONS = new Set(['.png', '.webp', '.gif', '.jpg', '.jpeg']);
const FALLBACK_AVATAR_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const STRINGS = {
    en: {
        exportTitle: 'Export selected persona',
        importTitle: 'Import a persona card',
        noPersona: 'Select a persona before exporting.',
        chooseFormat: 'Choose an export format.',
        includeConnections: 'Include chat, character, and group connections',
        connectionExportHelp: 'Exports the chat lock, characters, and lorebook connected to this persona.',
        png: 'Save as PNG',
        json: 'Save as JSON',
        name: 'Name',
        title: 'Title',
        description: 'Description',
        lorebook: 'Lorebook',
        connections: 'Connections',
        connectionCharacter: 'Character',
        connectionGroup: 'Group',
        connectionFound: 'found',
        connectionMissing: 'not found',
        connectionsNotIncluded: 'Not included',
        none: 'None',
        format: 'Format',
        import: 'Import',
        cancel: 'Cancel',
        conflictTitle: 'Persona already exists',
        conflictText: 'A persona with the same internal ID already exists. Choose how to continue.',
        avatarConflictText: 'An unassigned avatar with the same internal ID already exists. Overwrite it or create a copy.',
        overwrite: 'Overwrite',
        copy: 'Create copy',
        connectionsTitle: 'Apply connection settings',
        connectionsText: '<p>Choose how to handle this persona\'s connection settings.</p><div><strong>Keep existing settings</strong>: Keeps the current connection settings.</div><div><strong>Import settings</strong>: Replaces them with the imported connection settings.</div>',
        keepConnections: 'Keep existing settings',
        replaceConnections: 'Import settings',
        missingConnections: count => `${count} imported connection(s) could not be found and were skipped.`,
        imported: 'Persona imported successfully.',
        overwritten: 'Persona overwritten successfully.',
        fullBackup: 'This is a full persona backup. Use SillyTavern\'s existing Restore button.',
        noPngData: 'This PNG has no persona card data. Use the regular avatar upload for ordinary images.',
        invalidFile: 'The selected file is not a valid Persona Cards file.',
        unsupportedVersion: 'This persona card version is not supported.',
        fileTooLarge: 'The selected file is too large.',
        exportFailed: 'Could not export the persona card.',
        exportPngRequiresPng: 'PNG export requires a PNG avatar. Use JSON export for this persona, or convert the avatar to PNG first.',
        chatLockSkipped: 'The imported chat lock was not applied because no chat is currently open.',
        avatarPlaceholderSkipped: 'No avatar image was embedded. The original non-PNG avatar ID was preserved, but no placeholder avatar was uploaded.',
        loreMissingNew: name => `Lorebook "${name}" was not found (importing without a connection).`,
        loreMissingOverwrite: name => `Lorebook "${name}" was not found (keeping the existing connection).`,
    },
    ko: {
        exportTitle: '선택한 페르소나 내보내기',
        importTitle: '페르소나 카드 가져오기',
        noPersona: '내보낼 페르소나를 먼저 선택하세요.',
        chooseFormat: '내보낼 형식을 선택하세요.',
        includeConnections: '캐릭터 및 그룹 연결 정보 포함',
        connectionExportHelp: '페르소나와 연결된 채팅 잠금, 캐릭터, 로어북 정보를 같이 내보내기합니다.',
        png: 'PNG 저장',
        json: 'JSON 저장',
        name: '이름',
        title: '제목',
        description: '설명',
        lorebook: '로어북',
        connections: '연결 상태',
        connectionCharacter: '캐릭터',
        connectionGroup: '그룹',
        connectionFound: '찾음',
        connectionMissing: '찾을 수 없음',
        connectionsNotIncluded: '포함되지 않음',
        none: '없음',
        format: '형식',
        import: '가져오기',
        cancel: '취소',
        conflictTitle: '같은 페르소나가 이미 있음',
        conflictText: '동일한 내부 ID를 가진 페르소나가 있습니다. 처리 방법을 선택하세요.',
        avatarConflictText: '동일한 내부 ID를 가진 미등록 아바타가 있습니다. 덮어쓰거나 복사본을 생성하세요.',
        overwrite: '덮어쓰기',
        copy: '복사본 생성',
        connectionsTitle: '연결 설정 적용',
        connectionsText: '<p>페르소나의 연결 정보를 어떻게 처리할지 선택하세요.</p><div><strong>기존 설정 유지</strong>: 기존 연결 설정을 유지합니다.</div><div><strong>가져온 설정으로 교체</strong>: 가져온 연결 설정으로 교체합니다.</div>',
        keepConnections: '기존 설정 유지',
        replaceConnections: '가져온 설정으로 교체',
        missingConnections: count => `가져온 연결 ${count}개를 찾을 수 없어 건너뛰었습니다.`,
        imported: '페르소나를 가져왔습니다.',
        overwritten: '페르소나를 덮어썼습니다.',
        fullBackup: '전체 페르소나 백업 파일입니다. SillyTavern의 기존 복원 버튼을 사용하세요.',
        noPngData: '페르소나 카드 데이터가 없는 PNG입니다. 일반 이미지는 기존 아바타 업로드를 사용하세요.',
        invalidFile: '올바른 Persona Cards 파일이 아닙니다.',
        unsupportedVersion: '지원하지 않는 페르소나 카드 버전입니다.',
        fileTooLarge: '선택한 파일이 너무 큽니다.',
        exportFailed: '페르소나 카드를 내보내지 못했습니다.',
        loreMissingNew: name => `로어북 "${name}"을(를) 찾을 수 없음 (연결 없이 가져옵니다).`,
        loreMissingOverwrite: name => `로어북 "${name}"을(를) 찾을 수 없음 (기존 연결을 유지합니다).`,
    },
};

Object.assign(STRINGS.ko, {
    exportPngRequiresPng: '\uC544\uBC14\uD0C0\uAC00 PNG\uC77C \uB54C\uB9CC PNG\uB85C \uB0B4\uBCF4\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4. JSON\uC73C\uB85C \uB0B4\uBCF4\uB0B4\uAC70\uB098 \uC544\uBC14\uD0C0\uB97C PNG\uB85C \uBCC0\uD658\uD574 \uC8FC\uC138\uC694.',
    chatLockSkipped: '\uD604\uC7AC \uC5F4\uB9B0 \uCC44\uD305\uC774 \uC5C6\uC5B4 \uAC00\uC838\uC628 \uCC44\uD305 \uC7A0\uAE08\uC744 \uC801\uC6A9\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.',
    avatarPlaceholderSkipped: '\uD3EC\uD568\uB41C \uC544\uBC14\uD0C0 \uC774\uBBF8\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uAE30\uC874 non-PNG \uC544\uBC14\uD0C0 ID\uB294 \uC720\uC9C0\uD588\uC9C0\uB9CC, \uB300\uCCB4 \uC544\uBC14\uD0C0\uB294 \uC5C5\uB85C\uB4DC\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.',
});

let controls = null;
let exportControl = null;

function strings() {
    return getCurrentLocale().startsWith('ko') ? STRINGS.ko : STRINGS.en;
}

function createButton(icon, title, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `menu_button fa-solid ${icon} persona-cards-button`;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', action);
    return button;
}

function sanitizeFilename(name) {
    const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().replace(/[. ]+$/g, '');
    return cleaned || 'persona';
}

function createAvatarId(name) {
    const asciiName = name.replace(/[^a-zA-Z0-9]/g, '');
    let timestamp = Date.now();
    let candidate = `${timestamp}-${asciiName}.png`;
    while (Object.hasOwn(power_user.personas, candidate)) {
        candidate = `${++timestamp}-${asciiName}.png`;
    }
    return candidate;
}

function avatarExtension(id) {
    const match = String(id || '').toLowerCase().match(/\.[a-z0-9]+$/);
    return match?.[0] ?? '';
}

function safeImportedAvatarId(value, name) {
    const id = String(value || '').trim();
    const hasInvalidCharacters = /[<>:"/\\|?*\u0000-\u001F]/.test(id);
    if (!id || id.length > 240 || hasInvalidCharacters || !SAFE_AVATAR_EXTENSIONS.has(avatarExtension(id))) {
        return createAvatarId(name);
    }
    return id;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getConnectionName(connection) {
    if (connection.type === 'character') {
        return characters.find(character => character.avatar === connection.id)?.name ?? '';
    }
    if (connection.type === 'group') {
        return groups.find(group => String(group.id) === String(connection.id))?.name ?? '';
    }
    return '';
}

function chatLabel() {
    return getCurrentLocale().startsWith('ko') ? '채팅' : 'Chat';
}

function personaDocument(includeConnections) {
    const name = power_user.personas[user_avatar];
    if (!user_avatar || !name) return null;
    const descriptor = power_user.persona_descriptions[user_avatar] ?? {};
    const chatId = getCurrentChatId();
    const isLockedToCurrentChat = chat_metadata.persona === user_avatar && !!chatId;

    return createPersonaCard({
        avatar_id: user_avatar,
        name,
        description: descriptor.description ?? '',
        title: descriptor.title ?? '',
        position: descriptor.position ?? 0,
        depth: descriptor.depth ?? 2,
        role: descriptor.role ?? 0,
        lorebook: includeConnections ? (descriptor.lorebook ?? '') : '',
        lorebook_included: includeConnections,
        connections_included: includeConnections,
        connections: includeConnections
            ? (descriptor.connections ?? []).map(connection => ({
                type: connection.type,
                id: String(connection.id),
                name: getConnectionName(connection),
            }))
            : [],
        chat_lock_included: includeConnections && isLockedToCurrentChat,
        chat_lock: includeConnections && isLockedToCurrentChat
            ? { id: String(chatId), name: name2 || String(chatId) }
            : null,
    });
}

async function chooseExportFormat() {
    const s = strings();
    const content = document.createElement('div');
    const prompt = document.createElement('p');
    prompt.textContent = s.chooseFormat;

    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'checkbox_label persona-cards-export-connections';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    const checkboxText = document.createElement('span');
    checkboxText.textContent = s.includeConnections;
    checkboxLabel.append(checkbox, checkboxText);

    const help = document.createElement('small');
    help.className = 'persona-cards-export-help text_muted';
    help.textContent = s.connectionExportHelp;
    content.append(prompt, checkboxLabel, help);

    const popup = new Popup(content, POPUP_TYPE.TEXT, null, {
        okButton: false,
        cancelButton: s.cancel,
        customButtons: [
            { text: s.png, icon: 'fa-image', result: POPUP_RESULT.CUSTOM1 },
            { text: s.json, icon: 'fa-file-code', result: POPUP_RESULT.CUSTOM2 },
        ],
    });
    const format = await popup.show();
    if (format === POPUP_RESULT.CANCELLED) return null;
    return {
        format,
        includeConnections: checkbox.checked,
    };
}

async function exportPersona() {
    const s = strings();
    if (!user_avatar || !power_user.personas[user_avatar]) {
        toastr.warning(s.noPersona, 'Persona Cards');
        return;
    }

    const options = await chooseExportFormat();
    if (!options) return;
    const card = personaDocument(options.includeConnections);
    if (!card) return;

    const baseName = `${sanitizeFilename(card.data.name)}.persona`;
    try {
        if (options.format === POPUP_RESULT.CUSTOM1) {
            const response = await fetch(getUserAvatar(user_avatar), { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Avatar request failed: ${response.status}`);
            const png = embedPersonaCardInPng(await response.arrayBuffer(), card);
            downloadBlob(new Blob([png], { type: 'image/png' }), `${baseName}.png`);
        } else if (options.format === POPUP_RESULT.CUSTOM2) {
            const json = JSON.stringify(card, null, 2);
            downloadBlob(new Blob([json], { type: 'application/json' }), `${baseName}.json`);
        }
    } catch (error) {
        console.error('[Persona Cards] Export failed', error);
        if (error instanceof Error && error.message === 'NOT_PNG') {
            toastr.error(s.exportPngRequiresPng ?? STRINGS.en.exportPngRequiresPng, 'Persona Cards');
        } else {
            toastr.error(s.exportFailed, 'Persona Cards');
        }
    }
}

function resolveImportedConnections(card) {
    if (!card.data.connections_included) return { resolved: [], unresolved: [] };

    const resolved = [];
    const unresolved = [];
    for (const imported of card.data.connections) {
        const found = imported.type === 'character'
            ? characters.some(character => character.avatar === imported.id)
            : groups.some(group => String(group.id) === String(imported.id));
        const connection = { type: imported.type, id: imported.id };
        (found ? resolved : unresolved).push({
            connection,
            name: imported.name || getConnectionName(connection) || imported.id,
        });
    }
    return { resolved, unresolved };
}

function createIcon(className, title) {
    const icon = document.createElement('i');
    icon.className = `fa-solid fa-fw ${className}`;
    icon.title = title;
    icon.setAttribute('aria-label', title);
    return icon;
}

function createConnectionPreview(card) {
    const s = strings();

    if (!card.data.chat_lock_included && (!card.data.connections_included || !card.data.connections.length)) return null;

    const container = document.createElement('div');
    container.className = 'persona-cards-connections';

    if (card.data.chat_lock_included) {
        const hasOpenChat = !!getCurrentChatId();
        const row = document.createElement('div');
        row.className = 'persona-cards-connection';
        row.classList.toggle('persona-cards-connection-missing', !hasOpenChat);

        const name = document.createElement('span');
        name.className = 'persona-cards-connection-name';
        name.textContent = card.data.chat_lock?.name || card.data.chat_lock?.id || chatLabel();

        row.append(
            createIcon('fa-message', chatLabel()),
            name,
            createIcon(hasOpenChat ? 'fa-link' : 'fa-link-slash', hasOpenChat ? s.connectionFound : s.connectionMissing),
        );
        container.append(row);
    }

    if (!card.data.connections_included || !card.data.connections.length) return container;

    const { resolved, unresolved } = resolveImportedConnections(card);
    const connections = [...resolved.map(item => ({ ...item, found: true })), ...unresolved.map(item => ({ ...item, found: false }))];

    for (const item of connections) {
        const row = document.createElement('div');
        row.className = 'persona-cards-connection';
        row.classList.toggle('persona-cards-connection-missing', !item.found);

        const typeTitle = item.connection.type === 'character' ? s.connectionCharacter : s.connectionGroup;
        const typeIcon = item.connection.type === 'character' ? 'fa-user' : 'fa-users';
        const statusTitle = item.found ? s.connectionFound : s.connectionMissing;
        const statusIcon = item.found ? 'fa-link' : 'fa-link-slash';

        const name = document.createElement('span');
        name.className = 'persona-cards-connection-name';
        name.textContent = item.name;

        row.append(
            createIcon(typeIcon, typeTitle),
            name,
            createIcon(statusIcon, statusTitle),
        );
        container.append(row);
    }

    return container;
}

function createPreview(card, format, imageUrl) {
    const s = strings();
    const element = document.createElement('div');
    element.className = 'persona-cards-preview';

    const image = document.createElement('img');
    image.src = imageUrl || default_user_avatar;
    image.alt = card.data.name;
    element.append(image);

    const details = document.createElement('dl');
    const rows = [
        { label: s.name, value: card.data.name },
        { label: s.title, value: card.data.title, hidden: !card.data.title },
        { label: s.description, value: card.data.description, className: 'persona-cards-description', hidden: !card.data.description },
        { label: s.lorebook, value: card.data.lorebook, hidden: !card.data.lorebook_included || !card.data.lorebook },
        { label: s.connections, value: createConnectionPreview(card), className: 'persona-cards-connections-row' },
        { label: s.format, value: format.toUpperCase() },
    ];

    for (const { label, value, className, hidden } of rows) {
        if (hidden || value === null || value === undefined || value === '') continue;

        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        if (className) description.classList.add(className);
        if (value instanceof Node) {
            description.append(value);
        } else {
            description.textContent = value;
        }
        details.append(term, description);
    }

    element.append(details);
    return element;
}

async function confirmPreview(card, format, imageUrl) {
    const s = strings();
    const popup = new Popup(createPreview(card, format, imageUrl), POPUP_TYPE.CONFIRM, null, {
        okButton: s.import,
        cancelButton: s.cancel,
        wide: true,
        allowVerticalScrolling: true,
    });
    return await popup.show() === POPUP_RESULT.AFFIRMATIVE;
}

async function chooseConflictAction(hasPersona) {
    const s = strings();
    return await Popup.show.text(s.conflictTitle, hasPersona ? s.conflictText : s.avatarConflictText, {
        okButton: false,
        cancelButton: s.cancel,
        customButtons: [
            { text: s.overwrite, icon: 'fa-rotate', result: POPUP_RESULT.CUSTOM1, classes: ['danger_button'] },
            { text: s.copy, icon: 'fa-clone', result: POPUP_RESULT.CUSTOM2 },
        ],
    });
}

async function chooseConnectionAction() {
    const s = strings();
    return await Popup.show.text(s.connectionsTitle, s.connectionsText, {
        okButton: false,
        cancelButton: s.cancel,
        customButtons: [
            { text: s.keepConnections, icon: 'fa-shield', result: POPUP_RESULT.CUSTOM1 },
            { text: s.replaceConnections, icon: 'fa-rotate', result: POPUP_RESULT.CUSTOM2 },
        ],
    });
}

async function uploadAvatar(blob, avatarId) {
    const type = blob.type || 'image/png';
    const extension = avatarExtension(avatarId) || (type === 'image/webp' ? '.webp' : type === 'image/gif' ? '.gif' : type === 'image/jpeg' ? '.jpg' : '.png');
    const file = new File([blob], `avatar${extension}`, { type });
    const form = new FormData();
    form.append('avatar', file);
    form.append('overwrite_name', avatarId);

    const response = await fetch('/api/avatars/upload', {
        method: 'POST',
        headers: getRequestHeaders({ omitContentType: true }),
        cache: 'no-cache',
        body: form,
    });
    if (!response.ok) {
        const responseBody = (await response.text().catch(() => '')).trim().slice(0, 300);
        throw new Error(`Avatar upload failed: ${response.status}${responseBody ? ` ${responseBody}` : ''}`);
    }

    await fetch(getUserAvatar(avatarId), { cache: 'reload' });
    await fetch(getThumbnailUrl('persona', avatarId), { cache: 'reload' });
}

async function defaultAvatarBlob() {
    const response = await fetch(default_user_avatar);
    if (!response.ok) throw new Error(`Default avatar request failed: ${response.status}`);
    return await response.blob();
}

async function uploadDefaultAvatar(avatarId) {
    if (avatarExtension(avatarId) !== '.png') {
        const s = strings();
        console.warn(`[Persona Cards] Skipping placeholder upload for non-PNG avatar ID: ${avatarId}`);
        toastr.warning(s.avatarPlaceholderSkipped ?? STRINGS.en.avatarPlaceholderSkipped, 'Persona Cards', { timeOut: 8000 });
        return;
    }

    try {
        await uploadAvatar(await defaultAvatarBlob(), avatarId);
    } catch (error) {
        console.warn('[Persona Cards] Default avatar upload failed; using bundled placeholder avatar.', error);
        try {
            const bytes = Uint8Array.from(atob(FALLBACK_AVATAR_PNG), char => char.charCodeAt(0));
            await uploadAvatar(new Blob([bytes], { type: 'image/png' }), avatarId);
        } catch (fallbackError) {
            console.warn('[Persona Cards] Bundled placeholder avatar upload failed; continuing with persona metadata only.', fallbackError);
        }
    }
}

function resolveLorebook(importedName, overwrite, existingDescriptor) {
    if (!importedName) return { value: '', warning: '' };
    if (world_names?.includes(importedName)) return { value: importedName, warning: '' };

    const s = strings();
    return overwrite
        ? { value: existingDescriptor?.lorebook ?? '', warning: s.loreMissingOverwrite(importedName) }
        : { value: '', warning: s.loreMissingNew(importedName) };
}

async function applyImport(card, imageBlob) {
    const s = strings();
    let avatarId = safeImportedAvatarId(card.data.avatar_id, card.data.name);
    let overwrite = Object.hasOwn(power_user.personas, avatarId);
    const avatarIds = await getUserAvatars(false);
    let avatarExists = avatarIds.includes(avatarId);

    if (overwrite || avatarExists) {
        const action = await chooseConflictAction(overwrite);
        if (action === POPUP_RESULT.CANCELLED) return;
        if (action === POPUP_RESULT.CUSTOM2) {
            avatarId = createAvatarId(card.data.name);
            overwrite = false;
            avatarExists = false;
        } else if (action !== POPUP_RESULT.CUSTOM1) {
            return;
        }
    }

    const existingDescriptor = power_user.persona_descriptions[avatarId] ?? {};
    const lorebook = card.data.lorebook_included
        ? resolveLorebook(card.data.lorebook, overwrite, existingDescriptor)
        : { value: '', warning: '' };
    const connectionResolution = resolveImportedConnections(card);
    const importedConnections = connectionResolution.resolved.map(item => item.connection);
    let finalConnections = [];
    let applyChatLock = false;

    if (card.data.connections_included || card.data.chat_lock_included) {
        if (overwrite) {
            finalConnections = existingDescriptor.connections ?? [];
            const connectionAction = await chooseConnectionAction();
            if (connectionAction === POPUP_RESULT.CANCELLED) return;
            if (connectionAction === POPUP_RESULT.CUSTOM2) {
                finalConnections = importedConnections;
                applyChatLock = card.data.chat_lock_included;
            } else if (connectionAction !== POPUP_RESULT.CUSTOM1) {
                return;
            }
        } else {
            finalConnections = importedConnections;
            applyChatLock = card.data.chat_lock_included;
        }
    }

    if (imageBlob) {
        await uploadAvatar(imageBlob, avatarId);
    } else if (!overwrite && !avatarExists) {
        await uploadDefaultAvatar(avatarId);
    }

    if (overwrite) {
        const oldName = power_user.personas[avatarId];
        power_user.personas[avatarId] = card.data.name;
        power_user.persona_descriptions[avatarId] = {
            ...existingDescriptor,
            description: card.data.description,
            title: card.data.title,
            position: card.data.position,
            depth: card.data.depth,
            role: card.data.role,
            lorebook: lorebook.value,
            connections: finalConnections,
        };

        if (avatarId === user_avatar) {
            power_user.persona_description = card.data.description;
            power_user.persona_description_position = card.data.position;
            power_user.persona_description_depth = card.data.depth;
            power_user.persona_description_role = card.data.role;
            power_user.persona_description_lorebook = lorebook.value;
            if (oldName !== card.data.name) setUserName(card.data.name);
            setPersonaDescription();
        }

        saveSettingsDebounced();
        if (oldName !== card.data.name) {
            await eventSource.emit(event_types.PERSONA_RENAMED, { avatarId, oldName, newName: card.data.name });
        }
        await eventSource.emit(event_types.PERSONA_UPDATED, avatarId);
    } else {
        await initPersona(avatarId, card.data.name, card.data.description, card.data.title, {
            silent: true,
            position: card.data.position,
            depth: card.data.depth,
            role: card.data.role,
            lorebook: lorebook.value,
        });
        const descriptor = power_user.persona_descriptions[avatarId];
        if (!descriptor) throw new Error('Persona initialization did not create a descriptor');
        descriptor.connections = finalConnections;
        saveSettingsDebounced();
        await eventSource.emit(event_types.PERSONA_CREATED, {
            avatarId,
            name: card.data.name,
            description: card.data.description,
            title: card.data.title,
        });
    }

    if (applyChatLock) {
        if (getCurrentChatId()) {
            chat_metadata.persona = avatarId;
            await saveMetadata();
        } else {
            toastr.warning(s.chatLockSkipped ?? STRINGS.en.chatLockSkipped, 'Persona Cards', { timeOut: 8000 });
        }
    }

    await getUserAvatars(true, avatarId);
    toastr.success(overwrite ? s.overwritten : s.imported, 'Persona Cards');
    if (lorebook.warning) toastr.warning(lorebook.warning, 'Persona Cards', { timeOut: 8000 });
    if (connectionResolution.unresolved.length) {
        toastr.warning(s.missingConnections(connectionResolution.unresolved.length), 'Persona Cards', { timeOut: 8000 });
    }
}

function parseJsonCard(text) {
    const s = strings();
    let value;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error('INVALID_CARD');
    }

    if (value?.personas && value?.persona_descriptions) {
        toastr.info(s.fullBackup, 'Persona Cards', { timeOut: 8000 });
        return null;
    }
    return validatePersonaCard(value);
}

function showImportError(error) {
    const s = strings();
    const code = error instanceof Error ? error.message : '';
    if (code === 'NO_PERSONA_DATA') toastr.warning(s.noPngData, 'Persona Cards');
    else if (code === 'UNSUPPORTED_VERSION') toastr.warning(s.unsupportedVersion, 'Persona Cards');
    else if (code === 'FILE_TOO_LARGE' || code === 'METADATA_TOO_LARGE') toastr.warning(s.fileTooLarge, 'Persona Cards');
    else toastr.warning(s.invalidFile, 'Persona Cards');
}

async function importPersona(file) {
    let imageUrl = '';
    try {
        if (file.size > MAX_FILE_BYTES) throw new Error('FILE_TOO_LARGE');

        const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
        const format = isPng ? 'png' : 'json';
        const card = isPng
            ? extractPersonaCardFromPng(await file.arrayBuffer())
            : parseJsonCard(await file.text());
        if (!card) return;

        if (isPng) imageUrl = URL.createObjectURL(file);
        const confirmed = await confirmPreview(card, format, imageUrl);
        if (!confirmed) return;

        await applyImport(card, isPng ? file : null);
    } catch (error) {
        console.error('[Persona Cards] Import failed', error);
        showImportError(error);
    } finally {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
    }
}

function createControls() {
    if (controls?.isConnected && exportControl?.isConnected) return;
    const anchor = document.querySelector('#personas_restore');
    const exportAnchor = document.querySelector('#persona_delete_button');
    if (!anchor?.parentElement || !exportAnchor?.parentElement) {
        console.warn('[Persona Cards] Persona management controls were not found.');
        return;
    }

    const s = strings();
    controls = document.createElement('span');
    controls.id = `${EXTENSION_ID}-controls`;
    controls.className = 'persona-cards-controls';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.persona.png,.persona.json,.png,.json,image/png,application/json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (file) await importPersona(file);
    });

    const importButton = createButton('fa-id-card-clip', s.importTitle, () => fileInput.click());
    controls.append(importButton, fileInput);
    anchor.after(controls);

    exportControl = createButton('fa-file-export', s.exportTitle, exportPersona);
    exportControl.id = EXPORT_CONTROL_ID;
    exportAnchor.before(exportControl);
}

export async function init() {
    createControls();
}

export async function cleanup() {
    controls?.remove();
    controls = null;
    exportControl?.remove();
    exportControl = null;
}
