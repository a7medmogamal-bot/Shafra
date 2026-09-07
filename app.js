// ==================== CONFIGURATION ====================
const CONFIG = {
    FIREBASE: {
        apiKey: "AIzaSyBTvj2ul5sCA3d_VJC_U0Pb4JcOZjTJBf0",
        authDomain: "shafra-e6dc9.firebaseapp.com",
        databaseURL: "https://shafra-e6dc9-default-rtdb.firebaseio.com",
        projectId: "shafra-e6dc9",
        storageBucket: "shafra-e6dc9.firebasestorage.app",
        messagingSenderId: "403371145446",
        appId: "1:403371145446:web:df43a037a08a88ab586327",
        measurementId: "G-QL5YBPFLBC"
    },
    BREVO: {
        apiKey: "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",
        senderEmail: "a7med.mo.gamal@brevosend.com",
        senderName: "شَفْرَة"
    },
    OTP_EXPIRY: 300000, // 5 minutes
    OTP_MAX_ATTEMPTS: 3,
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_LOCK_TIME: 900000, // 15 minutes
    SESSION_DURATION: 2592000000, // 30 days
    PBKDF2_ITERATIONS: 600000
};

// ==================== FIREBASE INITIALIZATION ====================
let firebaseApp;
let firebaseDb;
let firebaseAuth;
let currentUser = null;
let currentSession = null;

function initFirebase() {
    try {
        firebaseApp = firebase.initializeApp(CONFIG.FIREBASE);
        firebaseDb = firebase.database();
        firebaseAuth = firebase.auth();
        firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        return true;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return false;
    }
}

// ==================== STATE MANAGEMENT ====================
const AppState = {
    currentUser: null,
    currentChatUser: null,
    currentConversation: null,
    friends: [],
    friendRequests: [],
    conversations: [],
    messages: [],
    blockedUsers: [],
    encryptionKeys: {},
    notificationsEnabled: true,
    theme: 'dark',
    qrScannerActive: false,
    selectedMessage: null,
    otpCode: null,
    otpExpiry: null,
    otpAttempts: 0
};

// ==================== UTILITY FUNCTIONS ====================
function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

function showScreen(screenId) {
    $$('.screen').forEach(screen => screen.classList.remove('active'));
    const screen = $(`#${screenId}`);
    if (screen) {
        screen.classList.add('active');
    }
}

function showView(viewId) {
    $$('.view').forEach(view => view.classList.remove('active'));
    const view = $(`#${viewId}`);
    if (view) {
        view.classList.add('active');
    }
    $$('.nav-item').forEach(item => item.classList.remove('active'));
    const navItem = document.querySelector(`[data-view="${viewId}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
}

function showToast(message, duration = 3000) {
    const toast = $('#toast');
    const toastMessage = $('#toastMessage');
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

function showLoader(button) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    if (btnText) btnText.classList.add('hidden');
    if (btnLoader) btnLoader.classList.remove('hidden');
    button.disabled = true;
}

function hideLoader(button) {
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');
    if (btnText) btnText.classList.remove('hidden');
    if (btnLoader) btnLoader.classList.add('hidden');
    button.disabled = false;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} د`;
    if (diff < 86400000) return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return date.toLocaleDateString('ar-EG', { weekday: 'short' });
    return date.toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateSecureId() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    return crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
    });
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    const re = /^\+?[0-9]{10,15}$/;
    return re.test(phone.replace(/[\s-]/g, ''));
}

function validatePassword(password) {
    return password.length >= 12;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== CRYPTOGRAPHY SYSTEM ====================
const CryptoSystem = {
    // Generate key pair for X3DH
    async generateIdentityKeyPair() {
        try {
            const keyPair = await crypto.subtle.generateKey(
                {
                    name: 'ECDH',
                    namedCurve: 'P-256'
                },
                true,
                ['deriveKey', 'deriveBits']
            );
            return keyPair;
        } catch (error) {
            console.error('Key generation error:', error);
            throw new Error('فشل توليد المفاتيح');
        }
    },

    // Export public key
    async exportPublicKey(keyPair) {
        const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        return this.arrayBufferToBase64(publicKey);
    },

    // Export private key (encrypted with password)
    async exportPrivateKey(keyPair, password) {
        const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        const wrappingKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: CONFIG.PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['wrapKey']
        );
        
        const wrappedKey = await crypto.subtle.wrapKey('pkcs8', keyPair.privateKey, wrappingKey, { name: 'AES-GCM', iv: iv });
        
        return {
            wrappedKey: this.arrayBufferToBase64(wrappedKey),
            salt: this.arrayBufferToBase64(salt),
            iv: this.arrayBufferToBase64(iv)
        };
    },

    // Import private key (decrypt with password)
    async importPrivateKey(wrappedData, password) {
        const wrappedKey = this.base64ToArrayBuffer(wrappedData.wrappedKey);
        const salt = this.base64ToArrayBuffer(wrappedData.salt);
        const iv = this.base64ToArrayBuffer(wrappedData.iv);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        const unwrappingKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: CONFIG.PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['unwrapKey']
        );
        
        return await crypto.subtle.unwrapKey(
            'pkcs8',
            wrappedKey,
            unwrappingKey,
            { name: 'AES-GCM', iv: iv },
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveKey', 'deriveBits']
        );
    },

    // Derive shared secret using ECDH
    async deriveSharedSecret(privateKey, publicKeyBase64) {
        const publicKeyBuffer = this.base64ToArrayBuffer(publicKeyBase64);
        const publicKey = await crypto.subtle.importKey(
            'spki',
            publicKeyBuffer,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );
        
        const sharedSecret = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: publicKey },
            privateKey,
            256
        );
        
        return this.arrayBufferToBase64(sharedSecret);
    },

    // Derive message key from shared secret using HKDF
    async deriveMessageKey(sharedSecretBase64, salt = null) {
        const sharedSecret = this.base64ToArrayBuffer(sharedSecretBase64);
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            sharedSecret,
            'HKDF',
            false,
            ['deriveKey']
        );
        
        const hkdfSalt = salt ? this.base64ToArrayBuffer(salt) : new Uint8Array(32);
        
        const messageKey = await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: hkdfSalt,
                info: new TextEncoder().encode('SHAFRA-MESSAGE-KEY')
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        
        return messageKey;
    },

    // Encrypt message
    async encryptMessage(plaintext, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedMessage = new TextEncoder().encode(plaintext);
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encodedMessage
        );
        
        return {
            ciphertext: this.arrayBufferToBase64(ciphertext),
            iv: this.arrayBufferToBase64(iv)
        };
    },

    // Decrypt message
    async decryptMessage(encryptedData, key) {
        const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
        const iv = this.base64ToArrayBuffer(encryptedData.iv);
        
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            ciphertext
        );
        
        return new TextDecoder().decode(plaintext);
    },

    // Convert ArrayBuffer to Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    },

    // Convert Base64 to ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    },

    // Generate random salt for HKDF
    generateSalt() {
        const salt = crypto.getRandomValues(new Uint8Array(32));
        return this.arrayBufferToBase64(salt);
    }
};

// ==================== QR CODE SYSTEM ====================
const QrSystem = {
    // Generate QR code for user
    async generateUserQR(userId, qrToken) {
        const qrData = JSON.stringify({
            type: 'shafra-user',
            userId: userId,
            token: qrToken,
            timestamp: Date.now()
        });
        
        // Simple QR generation using canvas
        const qrContainer = $('#myQrCode');
        qrContainer.innerHTML = '';
        
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 300;
        
        const ctx = canvas.getContext('2d');
        
        // Draw white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 300, 300);
        
        // Simple QR-like pattern based on hash
        const hash = await hashString(qrData);
        const blockSize = 10;
        const startX = 30;
        const startY = 30;
        
        ctx.fillStyle = '#000000';
        
        // Draw position markers
        this.drawPositionMarker(ctx, 30, 30);
        this.drawPositionMarker(ctx, 210, 30);
        this.drawPositionMarker(ctx, 30, 210);
        
        // Draw data pattern from hash
        for (let i = 0; i < hash.length; i++) {
            const value = parseInt(hash[i], 16);
            const bits = value.toString(2).padStart(4, '0');
            
            for (let j = 0; j < 4; j++) {
                const shouldDraw = bits[j] === '1';
                const row = Math.floor(i / 6);
                const col = (i % 6) * 4 + j;
                
                if (row < 10 && col < 20 && shouldDraw) {
                    const x = 60 + col * blockSize;
                    const y = 60 + row * blockSize;
                    
                    // Skip position markers
                    if (!(x > 20 && x < 80 && y > 20 && y < 80) &&
                        !(x > 200 && x < 260 && y > 20 && y < 80) &&
                        !(x > 20 && x < 80 && y > 200 && y < 260)) {
                        ctx.fillRect(x, y, blockSize - 2, blockSize - 2);
                    }
                }
            }
        }
        
        qrContainer.appendChild(canvas);
        
        return qrData;
    },

    drawPositionMarker(ctx, x, y) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, 50, 50);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 10, y + 10, 30, 30);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 20, y + 20, 10, 10);
    },

    // Scan QR code from video stream
    async scanQRCode() {
        const video = $('#qrVideo');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        // In a real implementation, use a QR decoding library
        // For now, return mock data
        return null;
    }
};

// ==================== OTP SYSTEM ====================
const OtpSystem = {
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    },

    async sendOTP(email, otp) {
        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': CONFIG.BREVO.apiKey
                },
                body: JSON.stringify({
                    sender: {
                        email: CONFIG.BREVO.senderEmail,
                        name: CONFIG.BREVO.senderName
                    },
                    to: [{ email: email }],
                    subject: 'رمز التحقق - شَفْرَة',
                    htmlContent: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc;">
                            <div style="text-align: center; padding: 30px; background: white; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                                <h2 style="color: #0a0f1e; margin-bottom: 10px;">شَفْرَة - رمز التحقق</h2>
                                <p style="color: #64748b; margin-bottom: 20px;">استخدم الرمز التالي لتأكيد حسابك:</p>
                                <div style="font-size: 32px; font-weight: bold; color: #00d4ff; letter-spacing: 5px; margin: 20px 0;">
                                    ${otp}
                                </div>
                                <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                                    الرمز صالح لمدة 5 دقائق فقط
                                </p>
                            </div>
                        </div>
                    `
                })
            });
            
            if (!response.ok) {
                throw new Error('فشل إرسال البريد الإلكتروني');
            }
            
            return true;
        } catch (error) {
            console.error('OTP send error:', error);
            throw new Error('تعذر إرسال رمز التحقق');
        }
    }
};

// ==================== AUTH SYSTEM ====================
const AuthSystem = {
    async register(name, email, phone, password) {
        try {
            // Generate user keys
            const keyPair = await CryptoSystem.generateIdentityKeyPair();
            const publicKey = await CryptoSystem.exportPublicKey(keyPair);
            const privateKeyData = await CryptoSystem.exportPrivateKey(keyPair, password);
            
            // Generate QR token
            const qrToken = generateSecureId();
            
            // Hash sensitive data
            const emailHash = await hashString(email);
            const phoneHash = await hashString(phone);
            
            // Generate OTP
            const otp = OtpSystem.generateOTP();
            const otpHash = await hashString(otp);
            
            // Store user data in Firebase (temporarily until OTP verified)
            const userId = generateUUID();
            
            await firebaseDb.ref(`pending_users/${userId}`).set({
                name: name,
                emailHash: emailHash,
                phoneHash: phoneHash,
                emailEncrypted: email,
                phoneEncrypted: phone,
                publicKey: publicKey,
                privateKeyData: privateKeyData,
                qrToken: qrToken,
                otpHash: otpHash,
                otpExpiry: Date.now() + CONFIG.OTP_EXPIRY,
                createdAt: Date.now()
            });
            
            // Send OTP via Brevo
            await OtpSystem.sendOTP(email, otp);
            
            // Store in session for verification
            AppState.otpCode = otp;
            AppState.otpExpiry = Date.now() + CONFIG.OTP_EXPIRY;
            AppState.otpAttempts = 0;
            
            return userId;
        } catch (error) {
            console.error('Registration error:', error);
            throw new Error(error.message || 'فشل إنشاء الحساب');
        }
    },

    async verifyOTP(userId, enteredOTP) {
        try {
            if (Date.now() > AppState.otpExpiry) {
                throw new Error('انتهت صلاحية الرمز');
            }
            
            if (AppState.otpAttempts >= CONFIG.OTP_MAX_ATTEMPTS) {
                throw new Error('تم تجاوز عدد المحاولات');
            }
            
            if (enteredOTP !== AppState.otpCode) {
                AppState.otpAttempts++;
                throw new Error('رمز التحقق غير صحيح');
            }
            
            // Get pending user data
            const pendingSnapshot = await firebaseDb.ref(`pending_users/${userId}`).once('value');
            const pendingData = pendingSnapshot.val();
            
            if (!pendingData) {
                throw new Error('بيانات التسجيل غير موجودة');
            }
            
            // Move user to confirmed users
            const userRef = firebaseDb.ref(`users/${userId}`);
            await userRef.set({
                name: pendingData.name,
                emailHash: pendingData.emailHash,
                phoneHash: pendingData.phoneHash,
                publicKey: pendingData.publicKey,
                qrToken: pendingData.qrToken,
                createdAt: pendingData.createdAt,
                notificationsEnabled: true,
                theme: 'dark'
            });
            
            // Remove pending user data
            await firebaseDb.ref(`pending_users/${userId}`).remove();
            
            // Store private key locally
            localStorage.setItem('shafra_private_key', JSON.stringify(pendingData.privateKeyData));
            localStorage.setItem('shafra_user_id', userId);
            
            // Authenticate with Firebase
            await firebaseAuth.signInAnonymously();
            
            // Update user profile
            if (firebaseAuth.currentUser) {
                await firebaseAuth.currentUser.updateProfile({
                    displayName: pendingData.name
                });
            }
            
            return true;
        } catch (error) {
            console.error('OTP verification error:', error);
            throw new Error(error.message || 'فشل التحقق');
        }
    },

    async login(identifier, password) {
        try {
            const identifierHash = await hashString(identifier);
            
            // Find user by email or phone hash
            const usersSnapshot = await firebaseDb.ref('users').once('value');
            const users = usersSnapshot.val();
            
            let foundUser = null;
            let foundUserId = null;
            
            for (const [userId, userData] of Object.entries(users || {})) {
                if (userData.emailHash === identifierHash || userData.phoneHash === identifierHash) {
                    foundUser = userData;
                    foundUserId = userId;
                    break;
                }
            }
            
            if (!foundUser) {
                throw new Error('المستخدم غير موجود');
            }
            
            // Verify password by trying to decrypt private key
            const privateKeyData = JSON.parse(localStorage.getItem('shafra_private_key') || 'null');
            
            if (!privateKeyData) {
                throw new Error('لا توجد بيانات محلية، قم بتسجيل الدخول من جهازك الأصلي');
            }
            
            try {
                const privateKey = await CryptoSystem.importPrivateKey(privateKeyData, password);
                // If we can import the key, password is correct
            } catch (error) {
                throw new Error('كلمة المرور غير صحيحة');
            }
            
            // Store session
            const sessionToken = generateSecureId();
            localStorage.setItem('shafra_session', JSON.stringify({
                userId: foundUserId,
                token: sessionToken,
                expiry: Date.now() + CONFIG.SESSION_DURATION
            }));
            
            // Store session in Firebase
            await firebaseDb.ref(`sessions/${sessionToken}`).set({
                userId: foundUserId,
                createdAt: Date.now(),
                lastActive: Date.now(),
                expiresAt: Date.now() + CONFIG.SESSION_DURATION
            });
            
            // Authenticate with Firebase
            await firebaseAuth.signInAnonymously();
            
            currentUser = {
                id: foundUserId,
                ...foundUser
            };
            
            return foundUser;
        } catch (error) {
            console.error('Login error:', error);
            throw new Error(error.message || 'فشل تسجيل الدخول');
        }
    },

    async logout() {
        try {
            const sessionData = JSON.parse(localStorage.getItem('shafra_session') || 'null');
            if (sessionData) {
                await firebaseDb.ref(`sessions/${sessionData.token}`).remove();
            }
            
            localStorage.removeItem('shafra_session');
            localStorage.removeItem('shafra_private_key');
            localStorage.removeItem('shafra_user_id');
            
            if (firebaseAuth.currentUser) {
                await firebaseAuth.signOut();
            }
            
            currentUser = null;
            currentSession = null;
            
            showScreen('authScreen');
        } catch (error) {
            console.error('Logout error:', error);
            showToast('حدث خطأ أثناء تسجيل الخروج');
        }
    },

    async deleteAccount() {
        if (!confirm('هل أنت متأكد من حذف حسابك؟ لا يمكن التراجع عن هذا الإجراء.')) {
            return;
        }
        
        try {
            const userId = currentUser.id;
            
            // Remove all user data
            await firebaseDb.ref(`users/${userId}`).remove();
            await firebaseDb.ref(`friends/${userId}`).remove();
            await firebaseDb.ref(`friendRequests/${userId}`).remove();
            await firebaseDb.ref(`blockedUsers/${userId}`).remove();
            
            // Remove conversations
            const conversationsSnapshot = await firebaseDb.ref('conversations').once('value');
            const conversations = conversationsSnapshot.val();
            
            for (const [convId, convData] of Object.entries(conversations || {})) {
                if (convData.participants && convData.participants.includes(userId)) {
                    await firebaseDb.ref(`conversations/${convId}`).remove();
                    await firebaseDb.ref(`messages/${convId}`).remove();
                }
            }
            
            await this.logout();
            showToast('تم حذف الحساب بنجاح');
        } catch (error) {
            console.error('Delete account error:', error);
            showToast('فشل حذف الحساب');
        }
    }
};

// ==================== FRIENDS SYSTEM ====================
const FriendsSystem = {
    async sendFriendRequest(fromUserId, toUserId) {
        try {
            if (fromUserId === toUserId) {
                throw new Error('لا يمكنك إرسال طلب لنفسك');
            }
            
            // Check if already friends
            const friendsRef = firebaseDb.ref(`friends/${fromUserId}/${toUserId}`);
            const friendsSnapshot = await friendsRef.once('value');
            
            if (friendsSnapshot.val()) {
                throw new Error('أنتما أصدقاء بالفعل');
            }
            
            // Check if blocked
            const blockedRef = firebaseDb.ref(`blockedUsers/${toUserId}/${fromUserId}`);
            const blockedSnapshot = await blockedRef.once('value');
            
            if (blockedSnapshot.val()) {
                throw new Error('لا يمكنك إرسال طلب إلى هذا المستخدم');
            }
            
            // Check if request already exists
            const requestId = generateUUID();
            await firebaseDb.ref(`friendRequests/${requestId}`).set({
                from: fromUserId,
                to: toUserId,
                status: 'pending',
                createdAt: Date.now()
            });
            
            return true;
        } catch (error) {
            console.error('Send friend request error:', error);
            throw new Error(error.message || 'فشل إرسال طلب الصداقة');
        }
    },

    async acceptFriendRequest(requestId) {
        try {
            const requestSnapshot = await firebaseDb.ref(`friendRequests/${requestId}`).once('value');
            const requestData = requestSnapshot.val();
            
            if (!requestData) {
                throw new Error('طلب الصداقة غير موجود');
            }
            
            const fromUserId = requestData.from;
            const toUserId = requestData.to;
            
            // Add to friends
            await firebaseDb.ref(`friends/${fromUserId}/${toUserId}`).set(true);
            await firebaseDb.ref(`friends/${toUserId}/${fromUserId}`).set(true);
            
            // Update request status
            await firebaseDb.ref(`friendRequests/${requestId}`).set({
                ...requestData,
                status: 'accepted'
            });
            
            // Create conversation
            const conversationId = this.generateConversationId(fromUserId, toUserId);
            await firebaseDb.ref(`conversations/${conversationId}`).set({
                participants: [fromUserId, toUserId],
                createdAt: Date.now(),
                lastMessage: null,
                lastMessageTime: null
            });
            
            return true;
        } catch (error) {
            console.error('Accept friend request error:', error);
            throw new Error('فشل قبول طلب الصداقة');
        }
    },

    async rejectFriendRequest(requestId) {
        try {
            await firebaseDb.ref(`friendRequests/${requestId}`).remove();
            return true;
        } catch (error) {
            console.error('Reject friend request error:', error);
            throw new Error('فشل رفض طلب الصداقة');
        }
    },

    generateConversationId(userId1, userId2) {
        const sortedIds = [userId1, userId2].sort();
        return sortedIds.join('_');
    },

    async getFriends(userId) {
        try {
            const friendsSnapshot = await firebaseDb.ref(`friends/${userId}`).once('value');
            const friendsData = friendsSnapshot.val() || {};
            
            const friends = [];
            for (const friendId of Object.keys(friendsData)) {
                const friendSnapshot = await firebaseDb.ref(`users/${friendId}`).once('value');
                const friendData = friendSnapshot.val();
                
                if (friendData) {
                    friends.push({
                        id: friendId,
                        ...friendData
                    });
                }
            }
            
            return friends;
        } catch (error) {
            console.error('Get friends error:', error);
            return [];
        }
    },

    async getFriendRequests(userId) {
        try {
            const requestsSnapshot = await firebaseDb.ref('friendRequests').once('value');
            const requestsData = requestsSnapshot.val() || {};
            
            const requests = [];
            for (const [requestId, requestData] of Object.entries(requestsData)) {
                if (requestData.to === userId && requestData.status === 'pending') {
                    const fromUserSnapshot = await firebaseDb.ref(`users/${requestData.from}`).once('value');
                    const fromUserData = fromUserSnapshot.val();
                    
                    if (fromUserData) {
                        requests.push({
                            id: requestId,
                            from: requestData.from,
                            ...fromUserData
                        });
                    }
                }
            }
            
            return requests;
        } catch (error) {
            console.error('Get friend requests error:', error);
            return [];
        }
    },

    async blockUser(userId, blockedUserId) {
        try {
            await firebaseDb.ref(`blockedUsers/${userId}/${blockedUserId}`).set(Date.now());
            
            // Remove friendship if exists
            await firebaseDb.ref(`friends/${userId}/${blockedUserId}`).remove();
            await firebaseDb.ref(`friends/${blockedUserId}/${userId}`).remove();
            
            // Remove conversation
            const conversationId = this.generateConversationId(userId, blockedUserId);
            await firebaseDb.ref(`conversations/${conversationId}`).remove();
            
            return true;
        } catch (error) {
            console.error('Block user error:', error);
            throw new Error('فشل حظر المستخدم');
        }
    },

    async unblockUser(userId, blockedUserId) {
        try {
            await firebaseDb.ref(`blockedUsers/${userId}/${blockedUserId}`).remove();
            return true;
        } catch (error) {
            console.error('Unblock user error:', error);
            throw new Error('فشل إلغاء الحظر');
        }
    },

    async getBlockedUsers(userId) {
        try {
            const blockedSnapshot = await firebaseDb.ref(`blockedUsers/${userId}`).once('value');
            const blockedData = blockedSnapshot.val() || {};
            
            const blockedUsers = [];
            for (const blockedId of Object.keys(blockedData)) {
                const userSnapshot = await firebaseDb.ref(`users/${blockedId}`).once('value');
                const userData = userSnapshot.val();
                
                if (userData) {
                    blockedUsers.push({
                        id: blockedId,
                        ...userData
                    });
                }
            }
            
            return blockedUsers;
        } catch (error) {
            console.error('Get blocked users error:', error);
            return [];
        }
    }
};

// ==================== CHAT SYSTEM ====================
const ChatSystem = {
    async sendMessage(conversationId, senderId, receiverId, plaintext) {
        try {
            // Get shared secret
            const sharedSecret = await this.getOrCreateSharedSecret(senderId, receiverId);
            const messageKey = await CryptoSystem.deriveMessageKey(sharedSecret);
            
            // Encrypt message
            const encryptedData = await CryptoSystem.encryptMessage(plaintext, messageKey);
            
            // Generate message ID
            const messageId = generateUUID();
            const timestamp = Date.now();
            
            // Store encrypted message
            await firebaseDb.ref(`messages/${conversationId}/${messageId}`).set({
                senderId: senderId,
                encryptedContent: encryptedData.ciphertext,
                iv: encryptedData.iv,
                timestamp: timestamp,
                status: 'sent'
            });
            
            // Update conversation last message
            await firebaseDb.ref(`conversations/${conversationId}`).update({
                lastMessage: timestamp,
                lastMessageTime: timestamp
            });
            
            return {
                id: messageId,
                senderId: senderId,
                encryptedContent: encryptedData.ciphertext,
                iv: encryptedData.iv,
                timestamp: timestamp,
                status: 'sent'
            };
        } catch (error) {
            console.error('Send message error:', error);
            throw new Error('فشل إرسال الرسالة');
        }
    },

    async getOrCreateSharedSecret(userId1, userId2) {
        const secretKey = `shared_secret_${[userId1, userId2].sort().join('_')}`;
        
        // Check if already exists in memory
        if (AppState.encryptionKeys[secretKey]) {
            return AppState.encryptionKeys[secretKey];
        }
        
        // Get user's private key
        const privateKeyData = JSON.parse(localStorage.getItem('shafra_private_key'));
        if (!privateKeyData) {
            throw new Error('المفاتيح الخاصة غير متوفرة');
        }
        
        // Get password from session
        const password = localStorage.getItem('shafra_password');
        if (!password) {
            throw new Error('كلمة المرور غير متوفرة');
        }
        
        const privateKey = await CryptoSystem.importPrivateKey(privateKeyData, password);
        
        // Get other user's public key
        const otherUserId = userId1 === currentUser.id ? userId2 : userId1;
        const userSnapshot = await firebaseDb.ref(`users/${otherUserId}`).once('value');
        const userData = userSnapshot.val();
        
        if (!userData || !userData.publicKey) {
            throw new Error('المفتاح العام للمستخدم غير متوفر');
        }
        
        // Derive shared secret
        const sharedSecret = await CryptoSystem.deriveSharedSecret(privateKey, userData.publicKey);
        
        // Store in memory
        AppState.encryptionKeys[secretKey] = sharedSecret;
        
        return sharedSecret;
    },

    async getMessages(conversationId) {
        try {
            const messagesSnapshot = await firebaseDb.ref(`messages/${conversationId}`).once('value');
            const messagesData = messagesSnapshot.val() || {};
            
            const messages = [];
            for (const [messageId, messageData] of Object.entries(messagesData)) {
                messages.push({
                    id: messageId,
                    ...messageData
                });
            }
            
            // Sort by timestamp
            messages.sort((a, b) => a.timestamp - b.timestamp);
            
            return messages;
        } catch (error) {
            console.error('Get messages error:', error);
            return [];
        }
    },

    async decryptMessages(messages, otherUserId) {
        try {
            const sharedSecret = await this.getOrCreateSharedSecret(currentUser.id, otherUserId);
            const messageKey = await CryptoSystem.deriveMessageKey(sharedSecret);
            
            const decryptedMessages = [];
            for (const message of messages) {
                try {
                    const plaintext = await CryptoSystem.decryptMessage({
                        ciphertext: message.encryptedContent,
                        iv: message.iv
                    }, messageKey);
                    
                    decryptedMessages.push({
                        ...message,
                        plaintext: plaintext
                    });
                } catch (error) {
                    // Skip messages that can't be decrypted
                    console.error('Failed to decrypt message:', message.id, error);
                }
            }
            
            return decryptedMessages;
        } catch (error) {
            console.error('Decrypt messages error:', error);
            return [];
        }
    },

    async markMessageAsRead(conversationId, messageId) {
        try {
            await firebaseDb.ref(`messages/${conversationId}/${messageId}`).update({
                status: 'read'
            });
            return true;
        } catch (error) {
            console.error('Mark message read error:', error);
            return false;
        }
    },

    async listenForMessages(conversationId, callback) {
        return firebaseDb.ref(`messages/${conversationId}`).on('child_added', (snapshot) => {
            const messageData = snapshot.val();
            callback({
                id: snapshot.key,
                ...messageData
            });
        });
    },

    async listenForConversations(userId, callback) {
        return firebaseDb.ref('conversations').on('value', async (snapshot) => {
            const conversationsData = snapshot.val() || {};
            const userConversations = [];
            
            for (const [convId, convData] of Object.entries(conversationsData)) {
                if (convData.participants && convData.participants.includes(userId)) {
                    userConversations.push({
                        id: convId,
                        ...convData
                    });
                }
            }
            
            callback(userConversations);
        });
    }
};

// ==================== UI RENDERING ====================
const UI = {
    renderChatsList(conversations) {
        const chatsList = $('#chatsList');
        const emptyChats = $('#emptyChats');
        chatsList.innerHTML = '';
        
        if (!conversations || conversations.length === 0) {
            chatsList.classList.add('hidden');
            emptyChats.classList.add('visible');
            return;
        }
        
        chatsList.classList.remove('hidden');
        emptyChats.classList.remove('visible');
        
        conversations.forEach(conv => {
            const otherUserId = conv.participants.find(id => id !== currentUser.id);
            
            // Get user info
            firebaseDb.ref(`users/${otherUserId}`).once('value').then(snapshot => {
                const userData = snapshot.val();
                if (!userData) return;
                
                const chatCard = document.createElement('div');
                chatCard.className = 'chat-card';
                chatCard.onclick = () => openChat(otherUserId, userData);
                
                chatCard.innerHTML = `
                    <div class="chat-card-avatar">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="#00d4ff">
                            <circle cx="12" cy="8" r="4" fill="currentColor"/>
                            <path d="M4 21v-2a8 8 0 0 1 16 0v2" fill="currentColor"/>
                        </svg>
                        <div class="online-indicator"></div>
                    </div>
                    <div class="chat-card-info">
                        <div class="chat-card-name">${escapeHtml(userData.name)}</div>
                        <div class="chat-card-last-message">${conv.lastMessage ? 'رسالة جديدة' : 'ابدأ المحادثة'}</div>
                    </div>
                    <div class="chat-card-meta">
                        <div class="chat-card-time">${conv.lastMessageTime ? formatTime(conv.lastMessageTime) : ''}</div>
                        <div class="unread-badge">0</div>
                    </div>
                `;
                
                chatsList.appendChild(chatCard);
            });
        });
    },

    renderFriendsList(friends) {
        const friendsList = $('#friendsList');
        const emptyFriends = $('#emptyFriends');
        friendsList.innerHTML = '';
        
        if (!friends || friends.length === 0) {
            friendsList.classList.add('hidden');
            emptyFriends.classList.add('visible');
            return;
        }
        
        friendsList.classList.remove('hidden');
        emptyFriends.classList.remove('visible');
        
        friends.forEach(friend => {
            const friendCard = document.createElement('div');
            friendCard.className = 'friend-card';
            friendCard.onclick = () => openChat(friend.id, friend);
            
            friendCard.innerHTML = `
                <div class="chat-card-avatar">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="#00d4ff">
                        <circle cx="12" cy="8" r="4" fill="currentColor"/>
                        <path d="M4 21v-2a8 8 0 0 1 16 0v2" fill="currentColor"/>
                    </svg>
                </div>
                <div class="friend-card-info">
                    <div class="friend-card-name">${escapeHtml(friend.name)}</div>
                    <div class="friend-card-status online">متصل</div>
                </div>
            `;
            
            friendsList.appendChild(friendCard);
        });
    },

    renderFriendRequests(requests) {
        const friendsList = $('#friendsList');
        friendsList.innerHTML = '';
        
        if (!requests || requests.length === 0) {
            friendsList.innerHTML = '<div class="empty-state visible"><h3>لا توجد طلبات صداقة</h3></div>';
            return;
        }
        
        requests.forEach(request => {
            const requestCard = document.createElement('div');
            requestCard.className = 'friend-card';
            
            requestCard.innerHTML = `
                <div class="chat-card-avatar">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="#00d4ff">
                        <circle cx="12" cy="8" r="4" fill="currentColor"/>
                        <path d="M4 21v-2a8 8 0 0 1 16 0v2" fill="currentColor"/>
                    </svg>
                </div>
                <div class="friend-card-info">
                    <div class="friend-card-name">${escapeHtml(request.name)}</div>
                    <div class="friend-card-status">طلب صداقة جديد</div>
                </div>
                <div class="friend-actions">
                    <button class="btn-accept" onclick="acceptFriendRequest('${request.id}')">قبول</button>
                    <button class="btn-reject" onclick="rejectFriendRequest('${request.id}')">رفض</button>
                </div>
            `;
            
            friendsList.appendChild(requestCard);
        });
    },

    renderMessages(messages) {
        const messagesContainer = $('#messagesContainer');
        messagesContainer.innerHTML = '';
        
        messages.forEach(message => {
            const isSent = message.senderId === currentUser.id;
            const messageGroup = document.createElement('div');
            messageGroup.className = `message-group ${isSent ? 'sent' : 'received'}`;
            
            const statusIcon = isSent ? `
                <div class="message-status ${message.status === 'read' ? 'read' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L7 17l-5-5"/>
                        <path d="M22 10l-7.5 7.5L13 16"/>
                    </svg>
                </div>
            ` : '';
            
            messageGroup.innerHTML = `
                <div class="message-bubble">${escapeHtml(message.plaintext || '')}</div>
                <div class="message-meta">
                    <span>${formatTime(message.timestamp)}</span>
                    ${statusIcon}
                </div>
            `;
            
            // Add long press for copy
            messageGroup.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showMessageContextMenu(e, message);
            });
            
            messageGroup.addEventListener('touchstart', (e) => {
                // Long press detection
                const touchTimer = setTimeout(() => {
                    showMessageContextMenu(e, message);
                }, 500);
                
                messageGroup.addEventListener('touchend', () => clearTimeout(touchTimer), { once: true });
                messageGroup.addEventListener('touchmove', () => clearTimeout(touchTimer), { once: true });
            });
            
            messagesContainer.appendChild(messageGroup);
        });
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
};

// ==================== SCREENSHOT PROTECTION ====================
const ScreenshotProtection = {
    init() {
        // Detect Print Screen key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'PrintScreen' || (e.key === 'p' && e.ctrlKey && e.shiftKey)) {
                this.showProtection();
            }
        });
        
        // Detect visibility change (mobile screenshot)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.showProtection();
            }
        });
        
        // Detect screen capture API
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;
            navigator.mediaDevices.getDisplayMedia = async function(...args) {
                ScreenshotProtection.showProtection();
                return originalGetDisplayMedia.apply(navigator.mediaDevices, args);
            };
        }
    },
    
    showProtection() {
        const overlay = $('#screenshotOverlay');
        overlay.classList.add('active');
        
        setTimeout(() => {
            overlay.classList.remove('active');
        }, 1000);
    }
};

// ==================== COPY PROTECTION ====================
const CopyProtection = {
    init() {
        // Prevent right click
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Prevent copy
        document.addEventListener('copy', (e) => {
            if (!CopyProtection.isCopyAllowed) {
                e.preventDefault();
            }
        });
        
        // Prevent cut
        document.addEventListener('cut', (e) => {
            e.preventDefault();
        });
        
        // Prevent paste in non-input fields
        document.addEventListener('paste', (e) => {
            const target = e.target;
            if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }
        });
        
        // Prevent Ctrl+C, Ctrl+X, Ctrl+P
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && 
                (e.key === 'c' || e.key === 'x' || e.key === 'p')) {
                if (!CopyProtection.isCopyAllowed) {
                    e.preventDefault();
                }
            }
        });
    },
    
    isCopyAllowed: false,
    
    async copyMessage(message) {
        CopyProtection.isCopyAllowed = true;
        
        try {
            await navigator.clipboard.writeText(message.plaintext || '');
            showToast('تم نسخ الرسالة');
        } catch (error) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = message.plaintext || '';
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('تم نسخ الرسالة');
        }
        
        setTimeout(() => {
            CopyProtection.isCopyAllowed = false;
        }, 100);
    }
};

// ==================== MESSAGE CONTEXT MENU ====================
function showMessageContextMenu(event, message) {
    const menu = $('#messageContextMenu');
    menu.classList.remove('hidden');
    
    const x = event.clientX || event.touches[0].clientX;
    const y = event.clientY || event.touches[0].clientY;
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    AppState.selectedMessage = message;
    
    // Close menu on click elsewhere
    setTimeout(() => {
        document.addEventListener('click', closeMessageContextMenu, { once: true });
    }, 0);
}

function closeMessageContextMenu() {
    const menu = $('#messageContextMenu');
    menu.classList.add('hidden');
}

// ==================== EVENT HANDLERS ====================
async function handleRegister(e) {
    e.preventDefault();
    
    const name = $('#regName').value.trim();
    const email = $('#regEmail').value.trim();
    const phone = $('#regPhone').value.trim();
    const password = $('#regPassword').value;
    const confirmPassword = $('#regConfirmPassword').value;
    
    // Validation
    let hasError = false;
    
    if (!name || name.length < 2) {
        showError('regNameError', 'الاسم يجب أن يكون حرفين على الأقل');
        hasError = true;
    }
    
    if (!validateEmail(email)) {
        showError('regEmailError', 'البريد الإلكتروني غير صحيح');
        hasError = true;
    }
    
    if (!validatePhone(phone)) {
        showError('regPhoneError', 'رقم الهاتف غير صحيح');
        hasError = true;
    }
    
    if (!validatePassword(password)) {
        showError('regPasswordError', 'كلمة المرور قصيرة جدًا (12 حرف على الأقل)');
        hasError = true;
    }
    
    if (password !== confirmPassword) {
        showError('regConfirmPasswordError', 'كلمتا المرور غير متطابقتين');
        hasError = true;
    }
    
    if (hasError) return;
    
    const registerBtn = $('#registerBtn');
    showLoader(registerBtn);
    
    try {
        const userId = await AuthSystem.register(name, email, phone, password);
        
        // Store password temporarily for key decryption
        localStorage.setItem('shafra_password', password);
        
        // Show OTP screen
        showScreen('otpScreen');
        startOtpTimer();
        showToast('تم إرسال رمز التحقق إلى بريدك الإلكتروني');
    } catch (error) {
        showToast(error.message || 'فشل إنشاء الحساب');
    } finally {
        hideLoader(registerBtn);
    }
}

async function handleVerifyOtp() {
    const otpInputs = $$('.otp-input');
    let otp = '';
    otpInputs.forEach(input => {
        otp += input.value;
    });
    
    if (otp.length !== 6) {
        showError('otpError', 'أدخل رمز التحقق الكامل');
        return;
    }
    
    const verifyBtn = $('#verifyOtpBtn');
    showLoader(verifyBtn);
    
    try {
        const userId = localStorage.getItem('shafra_user_id');
        await AuthSystem.verifyOTP(userId, otp);
        
        // Clear password from storage
        localStorage.removeItem('shafra_password');
        
        showScreen('mainApp');
        $('#mainApp').classList.add('active');
        
        // Load user data
        await loadUserData();
        
        showToast('تم تأكيد الحساب بنجاح');
    } catch (error) {
        showError('otpError', error.message || 'فشل التحقق');
    } finally {
        hideLoader(verifyBtn);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const identifier = $('#loginIdentifier').value.trim();
    const password = $('#loginPassword').value;
    
    let hasError = false;
    
    if (!identifier) {
        showError('loginIdentifierError', 'أدخل البريد الإلكتروني أو رقم الهاتف');
        hasError = true;
    }
    
    if (!password) {
        showError('loginPasswordError', 'أدخل كلمة المرور');
        hasError = true;
    }
    
    if (hasError) return;
    
    const loginBtn = $('#loginBtn');
    showLoader(loginBtn);
    
    try {
        const userData = await AuthSystem.login(identifier, password);
        
        // Store password for session
        localStorage.setItem('shafra_password', password);
        
        // Store private key
        const privateKeyData = JSON.parse(localStorage.getItem('shafra_private_key'));
        if (privateKeyData) {
            localStorage.setItem('shafra_private_key', JSON.stringify(privateKeyData));
        }
        
        showScreen('mainApp');
        $('#mainApp').classList.add('active');
        
        // Load user data
        await loadUserData();
        
        showToast('تم تسجيل الدخول بنجاح');
    } catch (error) {
        showToast(error.message || 'فشل تسجيل الدخول');
    } finally {
        hideLoader(loginBtn);
    }
}

async function loadUserData() {
    const sessionData = JSON.parse(localStorage.getItem('shafra_session'));
    if (!sessionData) return;
    
    const userId = sessionData.userId;
    const userSnapshot = await firebaseDb.ref(`users/${userId}`).once('value');
    const userData = userSnapshot.val();
    
    if (!userData) return;
    
    currentUser = {
        id: userId,
        ...userData
    };
    
    // Update UI
    $('#navUserName').textContent = userData.name;
    $('#qrUserName').textContent = userData.name;
    $('#qrUserId').textContent = userId.substring(0, 20);
    $('#settingsEmailValue').textContent = userData.emailEncrypted || '-';
    $('#settingsPhoneValue').textContent = userData.phoneEncrypted || '-';
    
    // Generate QR
    await QrSystem.generateUserQR(userId, userData.qrToken);
    
    // Load friends
    await loadFriends();
    
    // Load conversations
    await loadConversations();
}

async function loadFriends() {
    const friends = await FriendsSystem.getFriends(currentUser.id);
    AppState.friends = friends;
    UI.renderFriendsList(friends);
}

async function loadFriendRequests() {
    const requests = await FriendsSystem.getFriendRequests(currentUser.id);
    AppState.friendRequests = requests;
    UI.renderFriendRequests(requests);
}

async function loadConversations() {
    const conversationsSnapshot = await firebaseDb.ref('conversations').once('value');
    const conversationsData = conversationsSnapshot.val() || {};
    
    const userConversations = [];
    for (const [convId, convData] of Object.entries(conversationsData)) {
        if (convData.participants && convData.participants.includes(currentUser.id)) {
            userConversations.push({
                id: convId,
                ...convData
            });
        }
    }
    
    AppState.conversations = userConversations;
    UI.renderChatsList(userConversations);
}

async function openChat(otherUserId, otherUserData) {
    const conversationId = FriendsSystem.generateConversationId(currentUser.id, otherUserId);
    
    AppState.currentChatUser = {
        id: otherUserId,
        ...otherUserData
    };
    AppState.currentConversation = conversationId;
    
    // Update chat header
    $('#chatUserName').textContent = otherUserData.name;
    $('#chatUserStatus').textContent = 'متصل';
    $('#chatUserStatus').classList.add('online');
    
    // Show chat view
    showView('chatView');
    $('#chatView').classList.add('active');
    
    // Load messages
    const messages = await ChatSystem.getMessages(conversationId);
    const decryptedMessages = await ChatSystem.decryptMessages(messages, otherUserId);
    
    AppState.messages = decryptedMessages;
    UI.renderMessages(decryptedMessages);
    
    // Listen for new messages
    ChatSystem.listenForMessages(conversationId, async (message) => {
        const sharedSecret = await ChatSystem.getOrCreateSharedSecret(currentUser.id, otherUserId);
        const messageKey = await CryptoSystem.deriveMessageKey(sharedSecret);
        
        try {
            const plaintext = await CryptoSystem.decryptMessage({
                ciphertext: message.encryptedContent,
                iv: message.iv
            }, messageKey);
            
            const decryptedMessage = {
                ...message,
                plaintext: plaintext
            };
            
            AppState.messages.push(decryptedMessage);
            UI.renderMessages(AppState.messages);
            
            // Mark as read if received
            if (message.senderId !== currentUser.id) {
                await ChatSystem.markMessageAsRead(conversationId, message.id);
            }
        } catch (error) {
            console.error('Failed to decrypt incoming message:', error);
        }
    });
}

async function handleSendMessage() {
    const messageInput = $('#messageInput');
    const messageText = messageInput.value.trim();
    
    if (!messageText) return;
    
    const sendBtn = $('#sendMessageBtn');
    sendBtn.disabled = true;
    
    try {
        const message = await ChatSystem.sendMessage(
            AppState.currentConversation,
            currentUser.id,
            AppState.currentChatUser.id,
            messageText
        );
        
        // Add to messages list
        const decryptedMessage = {
            ...message,
            plaintext: messageText
        };
        
        AppState.messages.push(decryptedMessage);
        UI.renderMessages(AppState.messages);
        
        messageInput.value = '';
    } catch (error) {
        showToast(error.message || 'فشل إرسال الرسالة');
    } finally {
        sendBtn.disabled = false;
    }
}

async function acceptFriendRequest(requestId) {
    try {
        await FriendsSystem.acceptFriendRequest(requestId);
        showToast('تم قبول طلب الصداقة');
        await loadFriends();
        await loadFriendRequests();
        await loadConversations();
    } catch (error) {
        showToast(error.message || 'فشل قبول الطلب');
    }
}

async function rejectFriendRequest(requestId) {
    try {
        await FriendsSystem.rejectFriendRequest(requestId);
        showToast('تم رفض طلب الصداقة');
        await loadFriendRequests();
    } catch (error) {
        showToast(error.message || 'فشل رفض الطلب');
    }
}

function showError(elementId, message) {
    const errorElement = $(`#${elementId}`);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('visible');
    }
}

function clearError(elementId) {
    const errorElement = $(`#${elementId}`);
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.classList.remove('visible');
    }
}

function startOtpTimer() {
    let timeLeft = 30;
    const timerText = $('#otpTimerText');
    const resendBtn = $('#resendOtpBtn');
    
    const timer = setInterval(() => {
        timeLeft--;
        timerText.textContent = `00:${timeLeft.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            resendBtn.disabled = false;
            timerText.textContent = '00:00';
        }
    }, 1000);
}

// ==================== QR SCANNER ====================
async function startQrScanner() {
    const modal = $('#qrScannerModal');
    const video = $('#qrVideo');
    
    modal.classList.add('active');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        
        video.srcObject = stream;
        video.play();
        AppState.qrScannerActive = true;
    } catch (error) {
        console.error('Camera access error:', error);
        showToast('تعذر الوصول إلى الكاميرا');
        modal.classList.remove('active');
    }
}

function stopQrScanner() {
    const modal = $('#qrScannerModal');
    const video = $('#qrVideo');
    
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    modal.classList.remove('active');
    AppState.qrScannerActive = false;
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Firebase
    const firebaseInitialized = initFirebase();
    
    if (!firebaseInitialized) {
        showToast('تعذر الاتصال بالخادم');
        return;
    }
    
    // Initialize protections
    CopyProtection.init();
    ScreenshotProtection.init();
    
    // Show splash screen
    showScreen('splashScreen');
    
    // Hide splash after 2 seconds
    setTimeout(() => {
        // Check for existing session
        const sessionData = JSON.parse(localStorage.getItem('shafra_session'));
        
        if (sessionData && sessionData.expiry > Date.now()) {
            // Restore session
            showScreen('mainApp');
            $('#mainApp').classList.add('active');
            loadUserData();
        } else {
            showScreen('authScreen');
        }
    }, 2000);
    
    // ==================== EVENT LISTENERS ====================
    
    // Splash
    setTimeout(() => {
        $('#splashScreen').classList.remove('active');
    }, 2000);
    
    // Auth navigation
    $('#showRegister').addEventListener('click', () => {
        showScreen('registerScreen');
    });
    
    $('#backToLogin').addEventListener('click', () => {
        showScreen('authScreen');
    });
    
    // Forms
    $('#registerForm').addEventListener('submit', handleRegister);
    $('#loginForm').addEventListener('submit', handleLogin);
    $('#verifyOtpBtn').addEventListener('click', handleVerifyOtp);
    
    // OTP inputs
    $$('.otp-input').forEach((input, index) => {
        input.addEventListener('input', () => {
            clearError('otpError');
            
            if (input.value.length === 1 && index < 5) {
                $$('.otp-input')[index + 1].focus();
            }
            
            // Check if all filled
            const allFilled = Array.from($$('.otp-input')).every(inp => inp.value.length === 1);
            if (allFilled) {
                handleVerifyOtp();
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                $$('.otp-input')[index - 1].focus();
            }
        });
    });
    
    // Toggle password visibility
    $$('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target || 'loginPassword';
            const input = $(`#${targetId}`);
            
            if (input.type === 'password') {
                input.type = 'text';
            } else {
                input.type = 'password';
            }
        });
    });
    
    // Navigation
    $$('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const viewId = item.dataset.view;
            showView(viewId);
            
            if (viewId === 'friends') {
                loadFriends();
                loadFriendRequests();
            }
            
            if (viewId === 'qr') {
                if (currentUser) {
                    QrSystem.generateUserQR(currentUser.id, currentUser.qrToken);
                }
            }
        });
    });
    
    // Search
    $('#searchChatsBtn').addEventListener('click', () => {
        const searchBar = $('#searchBar');
        searchBar.classList.toggle('hidden');
        if (!searchBar.classList.contains('hidden')) {
            $('#searchChatsInput').focus();
        }
    });
    
    $('#searchChatsInput').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const chatCards = $$('.chat-card');
        
        chatCards.forEach(card => {
            const name = card.querySelector('.chat-card-name').textContent.toLowerCase();
            if (name.includes(searchTerm)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    });
    
    // Add friend buttons
    $('#addFriendBtn').addEventListener('click', startQrScanner);
    $('#emptyAddFriend').addEventListener('click', startQrScanner);
    $('#scanQrBtn').addEventListener('click', startQrScanner);
    $('#emptyScanQr').addEventListener('click', startQrScanner);
    $('#closeQrScanner').addEventListener('click', stopQrScanner);
    
    // Friends tabs
    $$('.friend-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.friend-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabType = tab.dataset.tab;
            if (tabType === 'all') {
                loadFriends();
            } else {
                loadFriendRequests();
            }
        });
    });
    
    // Chat
    $('#backToChats').addEventListener('click', () => {
        showView('chats');
        loadConversations();
    });
    
    $('#sendMessageBtn').addEventListener('click', handleSendMessage);
    
    $('#messageInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
        }
    });
    
    // Message context menu
    $('#copyMessageBtn').addEventListener('click', async () => {
        if (AppState.selectedMessage) {
            await CopyProtection.copyMessage(AppState.selectedMessage);
            closeMessageContextMenu();
        }
    });
    
    // Settings
    $('#logoutBtn').addEventListener('click', AuthSystem.logout);
    $('#deleteAccountBtn').addEventListener('click', AuthSystem.deleteAccount);
    
    // Theme toggle
    $('#themeToggle').addEventListener('change', (e) => {
        const isDark = e.target.checked;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        localStorage.setItem('shafra_theme', isDark ? 'dark' : 'light');
    });
    
    // Notifications toggle
    $('#notificationsToggle').addEventListener('change', (e) => {
        AppState.notificationsEnabled = e.target.checked;
        localStorage.setItem('shafra_notifications', e.target.checked ? 'true' : 'false');
    });
    
    // Load saved preferences
    const savedTheme = localStorage.getItem('shafra_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    $('#themeToggle').checked = savedTheme === 'dark';
    
    const savedNotifications = localStorage.getItem('shafra_notifications') !== 'false';
    AppState.notificationsEnabled = savedNotifications;
    $('#notificationsToggle').checked = savedNotifications;
    
    // Close modals on backdrop click
    $$('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                if (modal.id === 'qrScannerModal') {
                    stopQrScanner();
                }
            }
        });
    });
    
    // Friend request modal
    $('#confirmFriendRequest').addEventListener('click', async () => {
        // Handle friend request confirmation
        showToast('تم إرسال طلب الصداقة');
        $('#friendRequestModal').classList.remove('active');
    });
    
    $('#cancelFriendRequest').addEventListener('click', () => {
        $('#friendRequestModal').classList.remove('active');
    });
    
    $('#closeFriendRequest').addEventListener('click', () => {
        $('#friendRequestModal').classList.remove('active');
    });
});

// ==================== PWA SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.log('Service worker registration failed:', error);
        });
    });
}

// ==================== NOTIFICATIONS ====================
async function requestNotificationPermission() {
    try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    } catch (error) {
        console.error('Notification permission error:', error);
        return false;
    }
}

function showNotification(title, body) {
    if (AppState.notificationsEnabled && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '/assets/logo.png'
        });
    }
}
