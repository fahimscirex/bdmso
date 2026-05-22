import React, { useState, useMemo } from 'react';

// --- INITIAL DATA & SEED STATES ---
const INITIAL_REGISTRATIONS = [
  {
    id: 'reg-1',
    title: 'National Olympiad',
    applicant: 'Tanvir Rivnat',
    class: 'Class 6',
    gender: 'Male',
    status: 'Paid',
    school: 'DRMC',
    district: 'Dhaka',
    examRegion: 'Dhaka',
    subject: 'Both (Math & Science)',
    amount: 1000,
    paidOn: '20 May 2026',
    registeredOn: '19 May 2026',
    txnId: '1FE840F6A734',
    bdmsoId: 'BdMSO02606-001'
  },
  {
    id: 'reg-2',
    title: 'Mock Test',
    applicant: 'Tanvir Rivnat',
    class: 'Class 6',
    gender: 'Male',
    status: 'Pending',
    school: 'DRMC',
    district: 'Dhaka',
    examRegion: 'Dhaka',
    registeredOn: '20 May 2026',
    amount: 500,
    couponApplied: false,
    originalAmount: 500
  },
  {
    id: 'reg-3',
    title: 'BdMSO Preparatory',
    applicant: 'Tanvir Rivnat',
    class: 'Class 6',
    gender: 'Male',
    status: 'Pending',
    school: 'DRMC',
    district: 'Dhaka',
    examRegion: 'Dhaka',
    registeredOn: '20 May 2026',
    amount: 3500,
    couponApplied: false,
    originalAmount: 3500
  }
];

const OPEN_PROGRAMS = [
  {
    id: 'prog-1',
    title: 'Maryam Mirzakhani School of Mathematics and Science',
    tags: ['Class 2-5', '3-Day Course'],
    category: 'Math',
    description: '3-day foundational masterclass exploring complex mathematical thinking and creative logic pathways tailored for primary level geniuses.',
    price: 1500,
    details: 'This intensive 3-day bootcamp focuses on spatial representation, non-routine equations, and geometric proofs. Perfect for beginners entering competitive arenas.'
  },
  {
    id: 'prog-2',
    title: 'STEM Foundation Program',
    tags: ['Class 2-8', 'Comprehensive'],
    category: 'STEM',
    description: 'The ultimate head start in Science, Technology, Engineering, and Math - covering practical logic blocks and natural patterns.',
    price: 2400,
    details: 'A multi-module course that merges basic coding theory, Newtonian mechanics, and modular arithmetic into interactive, visual experiments.'
  },
  {
    id: 'prog-3',
    title: 'BdMSO Preparatory Course',
    tags: ['Class 3-5', 'Olympiad Target'],
    category: 'Olympiad',
    description: 'Intensive 12-class Olympiad prep program bundled with 2 free simulated national-level mock tests. 31 May - 20 June 2026.',
    price: 3500,
    details: 'Our signature prep class led by former national medalists. Covers advanced number theory, combinatorics, and analytical biology.'
  },
  {
    id: 'prog-4',
    title: 'Mock Test Program',
    tags: ['All BdMSO Aspirants', 'Simulation'],
    category: 'Mock Exam',
    description: 'Mock exam simulations held on June 6th and June 20th to benchmark performance, resolve pacing, and map nationwide ranking standing.',
    price: 500,
    details: 'Two full-length test iterations matching exact national selection guidelines. Includes visual performance scorecards and solution video transcripts.'
  },
  {
    id: 'prog-5',
    title: 'Kids AI and Machine Learning',
    tags: ['Class 4-6', 'Modern Tech'],
    category: 'AI',
    description: 'An introductory, hands-on program where young learners bridge basic coding logic with real-world machine learning concepts.',
    price: 3000,
    details: 'Students will construct responsive classification trees and custom algorithms using lightweight visual playground assets.'
  }
];

export default function App() {
  // --- CORE STATE MANAGEMENT ---
  const [registrations, setRegistrations] = useState(INITIAL_REGISTRATIONS);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'catalog' | 'profile'
  const [selectedStatFilter, setSelectedStatFilter] = useState('all'); // 'all' | 'Paid' | 'Pending'
  const [theme, setTheme] = useState('light'); // 'light' | 'dark'
  
  // Custom Interaction States
  const [activeNotification, setActiveNotification] = useState({
    show: true,
    message: "Payment due for BdMSO Preparatory - register completely before registration closing window!"
  });
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Your transaction for National Olympiad was approved successfully.", time: "2 hours ago", unread: true },
    { id: 2, text: "Syllabus details for the Mock Test Program have been updated.", time: "1 day ago", unread: false },
    { id: 3, text: "Registration window for AI & ML class closes in 3 days.", time: "2 days ago", unread: false }
  ]);
  
  // Card-specific interactive inline-coupon states
  const [couponInputs, setCouponInputs] = useState({}); // { [regId]: string }
  const [couponErrors, setCouponErrors] = useState({}); // { [regId]: string }
  const [couponSuccesses, setCouponSuccesses] = useState({}); // { [regId]: string }

  // Virtual ID Card flip state
  const [idCardFlipped, setIdCardFlipped] = useState(false);

  // Modal Controllers
  const [paymentTarget, setPaymentTarget] = useState(null); // Registration object | null
  const [paymentMethod, setPaymentMethod] = useState('bkash'); // 'bkash' | 'nagad' | 'card'
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({ mobileNo: '', cardNo: '', expiry: '', cvc: '' });
  const [paymentError, setPaymentError] = useState('');

  const [receiptTarget, setReceiptTarget] = useState(null); // Registration object | null
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState('All'); // 'All' | 'Math' | 'STEM' | 'Olympiad' | 'Mock Exam' | 'AI'
  const [showRegisterSuccessToast, setShowRegisterSuccessToast] = useState(false);
  const [successToastMessage, setSuccessToastMessage] = useState('');

  // --- STATS DERIVATIONS ---
  const stats = useMemo(() => {
    const total = registrations.length;
    const paid = registrations.filter(r => r.status === 'Paid').length;
    const pending = registrations.filter(r => r.status === 'Pending').length;
    return { total, paid, pending };
  }, [registrations]);

  // --- REGISTRATION FILTERING ---
  const filteredRegistrations = useMemo(() => {
    if (selectedStatFilter === 'all') return registrations;
    return registrations.filter(r => r.status === selectedStatFilter);
  }, [registrations, selectedStatFilter]);

  // --- PROGRAM CATALOG SEARCH/FILTER ---
  const filteredCatalog = useMemo(() => {
    return OPEN_PROGRAMS.filter(prog => {
      const matchesSearch = prog.title.toLowerCase().includes(catalogSearch.toLowerCase()) || 
                            prog.description.toLowerCase().includes(catalogSearch.toLowerCase());
      const matchesCategory = catalogFilter === 'All' || prog.category === catalogFilter;
      return matchesSearch && matchesCategory;
    });
  }, [catalogSearch, catalogFilter]);

  // --- HANDLERS ---
  const handleToggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleApplyCoupon = (regId) => {
    const code = (couponInputs[regId] || '').trim().toUpperCase();
    if (code === 'BDMSO2026') {
      setRegistrations(prev => prev.map(reg => {
        if (reg.id === regId && !reg.couponApplied) {
          const discountAmount = Math.round(reg.originalAmount * 0.8); // 20% Off
          return { ...reg, amount: discountAmount, couponApplied: true };
        }
        return reg;
      }));
      setCouponSuccesses(prev => ({ ...prev, [regId]: 'Coupon Applied! 20% discount applied successfully.' }));
      setCouponErrors(prev => ({ ...prev, [regId]: '' }));
    } else {
      setCouponErrors(prev => ({ ...prev, [regId]: 'Invalid Coupon. Use coupon "BDMSO2026".' }));
      setCouponSuccesses(prev => ({ ...prev, [regId]: '' }));
    }
  };

  const handleCancelRegistration = (regId) => {
    if (window.confirm("Are you sure you want to cancel this registration?")) {
      setRegistrations(prev => prev.filter(reg => reg.id !== regId));
      triggerToast("Application registration successfully canceled.");
    }
  };

  const triggerToast = (msg) => {
    setSuccessToastMessage(msg);
    setShowRegisterSuccessToast(true);
    setTimeout(() => {
      setShowRegisterSuccessToast(false);
    }, 4000);
  };

  const handleRegisterNewProgram = (program) => {
    // Check if already registered
    const isAlreadyRegistered = registrations.some(r => r.title.toLowerCase() === program.title.toLowerCase());
    if (isAlreadyRegistered) {
      triggerToast(`You are already registered for ${program.title}!`);
      return;
    }

    const newReg = {
      id: `reg-${Date.now()}`,
      title: program.title,
      applicant: 'Tanvir Rivnat',
      class: 'Class 6',
      gender: 'Male',
      status: 'Pending',
      school: 'DRMC',
      district: 'Dhaka',
      examRegion: 'Dhaka',
      registeredOn: '20 May 2026',
      amount: program.price,
      couponApplied: false,
      originalAmount: program.price
    };

    setRegistrations(prev => [...prev, newReg]);
    triggerToast(`Successfully registered for ${program.title}! Proceed to checkout.`);
    setActiveTab('dashboard');
  };

  const startPayment = (registration) => {
    setPaymentTarget(registration);
    setPaymentDetails({ mobileNo: '', cardNo: '', expiry: '', cvc: '' });
    setPaymentError('');
  };

  const processPaymentSimulated = (e) => {
    e.preventDefault();
    if (paymentMethod === 'bkash' || paymentMethod === 'nagad') {
      if (!paymentDetails.mobileNo || paymentDetails.mobileNo.length < 11) {
        setPaymentError('Please enter a valid 11-digit mobile number.');
        return;
      }
    } else {
      if (!paymentDetails.cardNo || paymentDetails.cardNo.length < 16) {
        setPaymentError('Please enter a valid 16-digit card number.');
        return;
      }
    }

    setIsProcessingPayment(true);
    setPaymentError('');

    // Simulate Payment Gateway Network Latency
    setTimeout(() => {
      setRegistrations(prev => prev.map(reg => {
        if (reg.id === paymentTarget.id) {
          return {
            ...reg,
            status: 'Paid',
            paidOn: '20 May 2026',
            txnId: 'TXN' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            bdmsoId: 'BdMSO02606-001'
          };
        }
        return reg;
      }));

      // Push a new unread success notification
      setNotifications(prev => [
        {
          id: Date.now(),
          text: `Payment of ৳${paymentTarget.amount} for ${paymentTarget.title} processed successfully.`,
          time: "Just now",
          unread: true
        },
        ...prev
      ]);

      setIsProcessingPayment(false);
      setPaymentTarget(null);
      triggerToast(`Payment successful for ${paymentTarget.title}!`);
    }, 1800);
  };

  const handleMarkNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* --- FLOATING ALERTS SECTION --- */}
      {activeNotification.show && (
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-blue-900 text-white shadow-md relative z-50">
          <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8 flex items-center justify-between text-xs sm:text-sm font-medium">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-white animate-pulse">
                🔔
              </span>
              <span>{activeNotification.message}</span>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => {
                  const prep = registrations.find(r => r.title.includes('Preparatory'));
                  if (prep) startPayment(prep);
                }} 
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold px-3 py-1 rounded-md transition text-xs whitespace-nowrap"
              >
                Pay Now
              </button>
              <button 
                onClick={() => setActiveNotification({ show: false, message: '' })} 
                className="text-white/70 hover:text-white text-base font-bold leading-none p-1 transition"
              >
                &times;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TOAST SUCCESS NOTIFICATIONS --- */}
      {showRegisterSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl bg-slate-900 text-white p-4 shadow-2xl flex items-center gap-3 border border-slate-700 animate-slide-up">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            ✓
          </div>
          <p className="text-sm font-medium">{successToastMessage}</p>
        </div>
      )}

      {/* --- GLOBAL APPLICATION HEADER --- */}
      <header className={`sticky top-0 z-40 w-full border-b transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200'} backdrop-blur-md`}>
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          
          {/* Logo Brand Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-900 text-white font-extrabold text-base shadow-lg shadow-indigo-500/30">
              Bd
            </div>
            <div>
              <span className="block font-black text-lg tracking-tight leading-none text-indigo-600 dark:text-indigo-400">BdMSO</span>
              <span className={`text-2xs uppercase tracking-widest font-bold leading-none ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Olympiad Portal</span>
            </div>
          </div>

          {/* Unified Primary Page Navigation */}
          <nav className="hidden md:flex items-center gap-1.5 text-sm font-semibold">
            <button 
              onClick={() => { setActiveTab('dashboard'); setSelectedStatFilter('all'); }}
              className={`rounded-xl px-4 py-2.5 transition-all ${activeTab === 'dashboard' ? (theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-indigo-50 text-indigo-700') : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('catalog')}
              className={`rounded-xl px-4 py-2.5 transition-all ${activeTab === 'catalog' ? (theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-indigo-50 text-indigo-700') : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Programs Catalog
            </button>
            <button 
              onClick={() => setActiveTab('profile')}
              className={`rounded-xl px-4 py-2.5 transition-all ${activeTab === 'profile' ? (theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-indigo-50 text-indigo-700') : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              My Profile
            </button>
          </nav>

          {/* User Settings & Interactive Widgets */}
          <div className="flex items-center gap-4">
            
            {/* Visual Theme Toggle */}
            <button 
              onClick={handleToggleTheme}
              className={`p-2.5 rounded-xl transition ${theme === 'dark' ? 'bg-slate-800 text-amber-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              title="Toggle Theme"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 4.343l-.707-.707M14.25 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Notification Drawer Popover */}
            <div className="relative">
              <button 
                onClick={() => setShowNotificationsMenu(!showNotificationsMenu)}
                className={`relative p-2.5 rounded-xl transition ${theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {notifications.some(n => n.unread) && (
                  <span className="absolute right-1.5 top-1.5 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-bounce"></span>
                )}
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>

              {showNotificationsMenu && (
                <div className={`absolute right-0 mt-3 w-80 rounded-2xl shadow-2xl border p-4 z-50 animate-fade-in ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-900'}`}>
                  <div className="flex items-center justify-between mb-3 border-b pb-2 border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-sm">Notifications</span>
                    <button 
                      onClick={handleMarkNotificationsAsRead} 
                      className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 transition"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {notifications.map(n => (
                      <div key={n.id} className={`p-2.5 rounded-xl text-xs transition ${n.unread ? (theme === 'dark' ? 'bg-indigo-950/40 text-indigo-100 border border-indigo-900' : 'bg-indigo-50 text-indigo-900') : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500'}`}>
                        <div className="flex justify-between font-bold mb-1">
                          <span>System Announcement</span>
                          <span className="text-3xs font-medium text-slate-400">{n.time}</span>
                        </div>
                        <p>{n.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Avatar Trigger */}
            <div 
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-3 border-l pl-4 cursor-pointer hover:opacity-85 transition ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}
            >
              <div className="text-right hidden lg:block">
                <span className="block text-sm font-bold leading-none">Julekha</span>
                <span className="text-3xs text-slate-400 font-semibold tracking-wider">PRIMARY PARTICIPANT</span>
              </div>
              <div className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 font-extrabold text-white text-base shadow-md shadow-indigo-500/20">
                  J
                </div>
                <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-950"></div>
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* --- MASTER WRAPPER --- */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
        
        {/* =======================================
            TAB 1: PRIMARY STUDENT DASHBOARD VIEW
            ======================================= */}
        {activeTab === 'dashboard' && (
          <>
            {/* Interactive Hero Banner & Virtualized Glass ID Card */}
            <section className="relative rounded-3xl bg-slate-900 text-white shadow-2xl overflow-hidden bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-950">
              {/* Abstract decorative ambient background meshes */}
              <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl"></div>
              <div className="absolute left-1/4 -bottom-12 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl"></div>

              <div className="relative flex flex-col xl:flex-row xl:items-center xl:justify-between p-8 sm:p-10 gap-8">
                
                {/* Left Side: Dynamic Greeting */}
                <div className="space-y-3.5 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
                    🏆 BdMSO Selected Candidate 2026
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Welcome, Julekha! 👋🏼</h1>
                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    Here's everything tied to your academic dashboard. Manage your Olympiad schedules, complete pending application clearances, and check evaluation metrics.
                  </p>
                  
                  <div className="flex items-center gap-3 pt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Online Portal Secure
                    </span>
                    <span className="text-slate-600">•</span>
                    <span>Last login: Today 01:42 AM</span>
                  </div>
                </div>

                {/* Right Side: Click-to-Flip Virtual Smart ID Badge Card */}
                <div 
                  onClick={() => setIdCardFlipped(!idCardFlipped)}
                  className="relative cursor-pointer select-none transition-all duration-500 preserve-3d w-full sm:w-80 h-44"
                  title="Click to flip ID Card"
                >
                  <div className={`absolute inset-0 w-full h-full rounded-2xl border transition-all duration-500 p-5 flex flex-col justify-between ${idCardFlipped ? 'rotate-y-180 opacity-0' : 'opacity-100'} bg-white/5 border-white/10 backdrop-blur-md`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="block text-[10px] uppercase font-bold tracking-widest text-indigo-400">Bangladesh Primary</span>
                        <span className="block text-xs font-bold text-slate-100">Math & Science Olympiad</span>
                      </div>
                      <div className="h-7 w-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-xs">🎓</div>
                    </div>

                    <div>
                      <span className="block text-3xs uppercase text-slate-400 tracking-wider font-semibold">Registered Candidate</span>
                      <span className="block text-base font-bold text-white tracking-wide">Julekha</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-3">
                      <div>
                        <span className="block text-[9px] uppercase text-slate-400">BdMSO ID Number</span>
                        <span className="block font-mono text-xs font-bold text-indigo-300">BdMSO02606-001</span>
                      </div>
                      <span className="text-[10px] bg-indigo-600 text-white font-bold px-2 py-0.5 rounded-full uppercase">Class 6</span>
                    </div>
                  </div>

                  {/* ID CARD BACK (Interactive Flip Effect simulation) */}
                  <div className={`absolute inset-0 w-full h-full rounded-2xl border transition-all duration-500 p-5 flex flex-col justify-between bg-slate-900 border-slate-700 ${idCardFlipped ? 'opacity-100' : 'rotate-y-180 opacity-0'}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-3xs uppercase text-slate-400 tracking-wider">Candidate Verification Barcode</span>
                      <span className="text-[9px] text-emerald-400 font-bold uppercase">Active Status</span>
                    </div>
                    {/* Simulated barcode graphic lines */}
                    <div className="h-10 w-full bg-white rounded-lg flex items-center justify-around px-4 overflow-hidden">
                      <div className="h-full w-2 bg-slate-900"></div>
                      <div className="h-full w-0.5 bg-slate-900"></div>
                      <div className="h-full w-1 bg-slate-900"></div>
                      <div className="h-full w-3 bg-slate-900"></div>
                      <div className="h-full w-0.5 bg-slate-900"></div>
                      <div className="h-full w-2 bg-slate-900"></div>
                      <div className="h-full w-1 bg-slate-900"></div>
                      <div className="h-full w-0.5 bg-slate-900"></div>
                      <div className="h-full w-3 bg-slate-900"></div>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-slate-400">Scan at regional centers to confirm validation entries.</p>
                      <p className="text-[10px] font-mono font-bold text-indigo-400 mt-0.5">SECURE_KEY: F6A734_BDMSO</p>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            {/* Interactive Stats Filters Row */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-extrabold text-slate-400">Quick Stats Filters</span>
                <span className="text-3xs text-slate-400">Click a card to filter registration tracks</span>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                
                {/* Total Registrations */}
                <div 
                  onClick={() => setSelectedStatFilter('all')}
                  className={`cursor-pointer rounded-2xl border p-5 transition-all relative overflow-hidden ${selectedStatFilter === 'all' ? (theme === 'dark' ? 'bg-indigo-950/40 border-indigo-600 ring-2 ring-indigo-500/20' : 'bg-indigo-50/50 border-indigo-200 ring-4 ring-indigo-100') : (theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800')}`}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div>
                      <span className="block text-xs font-semibold text-slate-400">Total Applications</span>
                      <span className="mt-1 block text-3xl font-extrabold">{stats.total}</span>
                    </div>
                    <div className={`rounded-xl p-3 ${theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                      📂
                    </div>
                  </div>
                  {selectedStatFilter === 'all' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500"></div>
                  )}
                </div>

                {/* Confirmed / Paid */}
                <div 
                  onClick={() => setSelectedStatFilter('Paid')}
                  className={`cursor-pointer rounded-2xl border p-5 transition-all relative overflow-hidden ${selectedStatFilter === 'Paid' ? (theme === 'dark' ? 'bg-emerald-950/40 border-emerald-600 ring-2 ring-emerald-500/20' : 'bg-emerald-50/50 border-emerald-200 ring-4 ring-emerald-100') : (theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800')}`}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div>
                      <span className="block text-xs font-semibold text-slate-400 font-medium">Cleared & Paid</span>
                      <span className="mt-1 block text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.paid}</span>
                    </div>
                    <div className="rounded-xl bg-emerald-100/60 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 p-3">
                      ✓
                    </div>
                  </div>
                  {selectedStatFilter === 'Paid' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500"></div>
                  )}
                </div>

                {/* Pending Payment */}
                <div 
                  onClick={() => setSelectedStatFilter('Pending')}
                  className={`cursor-pointer rounded-2xl border p-5 transition-all relative overflow-hidden ${selectedStatFilter === 'Pending' ? (theme === 'dark' ? 'bg-amber-950/40 border-amber-600 ring-2 ring-amber-500/20' : 'bg-amber-50/50 border-amber-200 ring-4 ring-amber-100') : (theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-200' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800')}`}
                >
                  <div className="flex items-center justify-between relative z-10">
                    <div>
                      <span className="block text-xs font-semibold text-slate-400">Awaiting Clearances</span>
                      <span className="mt-1 block text-3xl font-extrabold text-amber-500 dark:text-amber-400">{stats.pending}</span>
                    </div>
                    <div className="rounded-xl bg-amber-100/60 dark:bg-amber-950 text-amber-500 dark:text-amber-400 p-3">
                      ⏳
                    </div>
                  </div>
                  {selectedStatFilter === 'Pending' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-500"></div>
                  )}
                </div>

              </div>
            </section>

            {/* Grid Layout: Registrations List & Quick Info Board */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Left Column: Registered Tracks (2/3 width) */}
              <div className="lg:col-span-2 space-y-6">
                
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold tracking-tight">
                    Active Registrations {selectedStatFilter !== 'all' && `(${selectedStatFilter})`}
                  </h2>
                  <span className="text-xs text-slate-400 font-semibold uppercase">
                    showing {filteredRegistrations.length} items
                  </span>
                </div>

                {filteredRegistrations.length === 0 ? (
                  <div className={`text-center p-10 border rounded-2xl ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <span className="text-3xl block mb-2">🔎</span>
                    <p className="text-sm text-slate-500 font-bold">No registered entries match this filter.</p>
                    <button 
                      onClick={() => setSelectedStatFilter('all')} 
                      className="text-xs text-indigo-500 hover:underline mt-1 font-semibold"
                    >
                      Clear active stats filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filteredRegistrations.map((reg) => (
                      <div 
                        key={reg.id}
                        className={`rounded-2xl border transition-all duration-300 p-6 flex flex-col justify-between ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 hover:shadow-lg hover:border-slate-300'}`}
                      >
                        
                        {/* Header Status Flag */}
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-500 dark:text-indigo-400">BdMSO Standard Track</span>
                            <h3 className="text-lg font-bold mt-0.5">{reg.title}</h3>
                            <p className="text-xs text-slate-500 font-semibold mt-1">Applicant: {reg.applicant} • {reg.class}</p>
                          </div>
                          
                          {reg.status === 'Paid' ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                              ✓ Paid Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/40 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                              ⏳ Awaiting Payment
                            </span>
                          )}
                        </div>

                        {/* Parameter Grid Info Board */}
                        <div className={`mt-6 grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 text-xs border-y py-5 my-2 ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
                          <div>
                            <span className="block text-slate-400 font-medium">Institution/School</span>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{reg.school}</span>
                          </div>
                          <div>
                            <span className="block text-slate-400 font-medium">District Area</span>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{reg.district}</span>
                          </div>
                          {reg.examRegion && (
                            <div>
                              <span className="block text-slate-400 font-medium">Exam Region Venue</span>
                              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{reg.examRegion}</span>
                            </div>
                          )}
                          {reg.subject && (
                            <div>
                              <span className="block text-slate-400 font-medium">Exam Topic Focus</span>
                              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{reg.subject}</span>
                            </div>
                          )}
                          <div>
                            <span className="block text-slate-400 font-medium">Registration Date</span>
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{reg.registeredOn}</span>
                          </div>
                          <div>
                            <span className="block text-slate-400 font-medium">Amount Required</span>
                            <span className={`text-sm font-extrabold ${reg.status === 'Paid' ? 'text-slate-900 dark:text-slate-100' : 'text-rose-500'}`}>
                              ৳ {reg.amount.toLocaleString()}
                              {reg.couponApplied && <span className="text-[10px] text-emerald-500 font-bold ml-1.5">(20% OFF)</span>}
                            </span>
                          </div>
                        </div>

                        {/* Actions Blocks */}
                        {reg.status === 'Paid' ? (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
                            <div className="text-left">
                              <span className="block text-3xs text-slate-400 uppercase font-semibold">Security Transaction Key</span>
                              <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400">{reg.txnId}</span>
                            </div>
                            <button 
                              onClick={() => setReceiptTarget(reg)}
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-3 transition shadow-md shadow-emerald-500/10"
                            >
                              📥 Download Receipt
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-4 pt-4">
                            
                            {/* Inline Coupon Engine Component */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80">
                              <div className="text-left w-full sm:w-auto">
                                <span className="block text-2xs uppercase text-slate-400 tracking-wider font-bold">Promotion Portal</span>
                                <span className="text-xs text-slate-500">Apply code <code className="font-mono bg-amber-100 dark:bg-amber-950/50 text-amber-700 px-1 rounded font-bold">BDMSO2026</code></span>
                              </div>
                              
                              <div className="flex gap-2 w-full sm:w-auto">
                                <input 
                                  type="text"
                                  placeholder="COUPON_CODE"
                                  value={couponInputs[reg.id] || ''}
                                  onChange={(e) => setCouponInputs({ ...couponInputs, [reg.id]: e.target.value })}
                                  disabled={reg.couponApplied}
                                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase w-full sm:w-32 border focus:ring-2 focus:ring-indigo-500 outline-none ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}
                                />
                                <button 
                                  onClick={() => handleApplyCoupon(reg.id)}
                                  disabled={reg.couponApplied}
                                  className="bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg transition disabled:opacity-50"
                                >
                                  Apply
                                </button>
                              </div>
                            </div>

                            {/* Message Feedbacks */}
                            {couponErrors[reg.id] && <p className="text-2xs text-rose-500 font-bold px-1">⚠ {couponErrors[reg.id]}</p>}
                            {couponSuccesses[reg.id] && <p className="text-2xs text-emerald-500 font-bold px-1">✓ {couponSuccesses[reg.id]}</p>}

                            {/* Bottom Card Action Footer */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                              <button 
                                onClick={() => handleCancelRegistration(reg.id)}
                                className="text-xs font-bold text-slate-400 hover:text-rose-600 transition order-2 sm:order-1"
                              >
                                Cancel application entry
                              </button>
                              <button 
                                onClick={() => startPayment(reg)}
                                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-3 rounded-xl transition shadow-md shadow-indigo-500/10 order-1 sm:order-2"
                              >
                                Pay Securely • ৳ {reg.amount.toLocaleString()}
                              </button>
                            </div>

                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* Right Column: Portal Updates & Helpful Guide Resources */}
              <div className="space-y-6">
                
                {/* Portal Checklist Box */}
                <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <h3 className="font-bold text-base mb-4 tracking-tight">Your Dashboard Checklist</h3>
                  <div className="space-y-3.5">
                    
                    <div className="flex items-start gap-3 text-xs font-medium">
                      <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">✓</div>
                      <div>
                        <span className="block font-bold">Registration Entry Received</span>
                        <p className="text-slate-400 text-3xs">Logged in via security keys</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 text-xs font-medium">
                      <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">✓</div>
                      <div>
                        <span className="block font-bold">National Olympiad Complete</span>
                        <p className="text-slate-400 text-3xs">Payment validated 19 May</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 text-xs font-medium">
                      <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${stats.pending > 0 ? 'bg-amber-100 text-amber-700 font-extrabold' : 'bg-emerald-100 text-emerald-700'}`}>
                        {stats.pending > 0 ? '!' : '✓'}
                      </div>
                      <div>
                        <span className="block font-bold">Clear Pending Course Dues</span>
                        <p className="text-slate-400 text-3xs">{stats.pending} courses waiting checkout</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 text-xs font-medium">
                      <div className="h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0 font-bold">?</div>
                      <div>
                        <span className="block font-bold">Download Exam Syllabi</span>
                        <p className="text-slate-400 text-3xs">Unlock Math & Science guides</p>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Important Dates Feed */}
                <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <h3 className="font-bold text-base mb-4 tracking-tight">Important Dates (2026)</h3>
                  <div className="space-y-4 text-xs font-semibold">
                    <div className="border-l-2 border-indigo-500 pl-3.5">
                      <span className="block text-indigo-500 text-3xs uppercase">May 25, 2026</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">Pre-training Syllabus Released</p>
                    </div>
                    <div className="border-l-2 border-amber-500 pl-3.5">
                      <span className="block text-amber-500 text-3xs uppercase">May 31, 2026</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">BdMSO Preparatory Starts</p>
                    </div>
                    <div className="border-l-2 border-rose-500 pl-3.5">
                      <span className="block text-rose-500 text-3xs uppercase">June 6, 2026</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">First Nationwide Mock Test</p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Section: Open Registrations Slider (Redesigned with explicit Grid) */}
            <section className="space-y-6 pt-6">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">Recommended programs</span>
                  <h2 className="text-2xl font-extrabold tracking-tight mt-0.5">Explore Program Pathways</h2>
                </div>
                <button 
                  onClick={() => setActiveTab('catalog')}
                  className="text-sm font-bold text-indigo-500 hover:text-indigo-600 transition flex items-center gap-1.5"
                >
                  View Full Catalog ➔
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {OPEN_PROGRAMS.slice(0, 3).map((prog) => (
                  <div 
                    key={prog.id}
                    className={`rounded-2xl border p-6 flex flex-col justify-between transition-all duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 hover:shadow-xl hover:border-slate-300'}`}
                  >
                    <div>
                      <div className="flex gap-1.5 flex-wrap">
                        {prog.tags.map((tag, i) => (
                          <span key={i} className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-3xs font-extrabold text-slate-600 dark:text-slate-300 uppercase">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <h3 className="mt-4 font-extrabold text-base leading-snug line-clamp-1">{prog.title}</h3>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-3 leading-relaxed">{prog.description}</p>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="block text-3xs text-slate-400 uppercase font-semibold">Course Value</span>
                        <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">৳ {prog.price.toLocaleString()}</span>
                      </div>
                      <button 
                        onClick={() => handleRegisterNewProgram(prog)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition"
                      >
                        Register
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {/* =======================================
            TAB 2: PROGRAM PATHWAYS CATALOG VIEW
            ======================================= */}
        {activeTab === 'catalog' && (
          <div className="space-y-8">
            
            {/* Catalog Banner & Header */}
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <span className="text-xs uppercase tracking-widest font-extrabold text-indigo-500">2026 Academic Programs</span>
              <h1 className="text-3xl font-black tracking-tight">Expand Your Academic Horizons</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Explore a selective index of training programs designed specifically to elevate spatial thinking, analytical science capacities, and math competition readiness.
              </p>
            </div>

            {/* Interactive Filters Grid Control */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              
              {/* Category Filters row */}
              <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
                {['All', 'Math', 'STEM', 'Olympiad', 'Mock Exam', 'AI'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCatalogFilter(cat)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${catalogFilter === cat ? 'bg-indigo-600 text-white' : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Live Search Bar */}
              <div className="relative w-full md:w-80">
                <input 
                  type="text" 
                  placeholder="Search syllabus, class levels..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className={`w-full rounded-xl pl-9 pr-4 py-2.5 text-xs font-medium border focus:ring-2 focus:ring-indigo-500 outline-none ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-950'}`}
                />
                <span className="absolute left-3.5 top-3 text-xs opacity-40">🔍</span>
              </div>

            </div>

            {/* Catalog Results Grid */}
            {filteredCatalog.length === 0 ? (
              <div className="text-center py-20 border rounded-2xl">
                <span className="text-4xl block mb-2">📦</span>
                <p className="text-sm font-bold text-slate-500">No program modules matched your filters or search keys.</p>
                <button onClick={() => { setCatalogFilter('All'); setCatalogSearch(''); }} className="text-xs text-indigo-500 font-semibold mt-1 hover:underline">
                  Reset search inputs
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCatalog.map((prog) => {
                  const alreadyRegistered = registrations.some(r => r.title.toLowerCase() === prog.title.toLowerCase());
                  return (
                    <div 
                      key={prog.id}
                      className={`rounded-2xl border p-6 flex flex-col justify-between transition-all duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 hover:shadow-2xl'}`}
                    >
                      <div className="space-y-4">
                        <div className="flex gap-1.5">
                          <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-0.5 text-3xs font-bold text-indigo-600 uppercase">
                            {prog.category}
                          </span>
                          {prog.tags.map((tag, i) => (
                            <span key={i} className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-3xs font-semibold text-slate-500 dark:text-slate-300 uppercase">
                              {tag}
                            </span>
                          ))}
                        </div>

                        <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-snug">{prog.title}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{prog.description}</p>
                        
                        <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                          <span className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Module Details</span>
                          <p className="text-3xs text-slate-500 leading-relaxed">{prog.details}</p>
                        </div>
                      </div>

                      <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="block text-3xs text-slate-400 uppercase font-bold">Standard Value</span>
                          <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400">৳ {prog.price.toLocaleString()}</span>
                        </div>
                        <button 
                          onClick={() => handleRegisterNewProgram(prog)}
                          disabled={alreadyRegistered}
                          className={`text-xs font-bold px-4 py-2.5 rounded-xl transition ${alreadyRegistered ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                        >
                          {alreadyRegistered ? 'Already Registered' : 'Register Now'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Custom Global Search Catalog Callout Banner */}
            <div className="rounded-3xl bg-slate-900 text-white p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
              <div className="absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-white/5"></div>
              <div className="space-y-1">
                <h3 className="font-bold text-lg">Are you a school coordinator planning group registrations?</h3>
                <p className="text-xs text-slate-400">Receive custom institutional entry keys, flat discounts, and localized testing options.</p>
              </div>
              <button className="bg-white text-slate-950 hover:bg-slate-100 font-bold text-xs px-6 py-3 rounded-xl transition shrink-0">
                Contact Coordination Team ➔
              </button>
            </div>

          </div>
        )}

        {/* =======================================
            TAB 3: MY COMPREHENSIVE STUDENT PROFILE
            ======================================= */}
        {activeTab === 'profile' && (
          <div className="max-w-3xl mx-auto space-y-8">
            
            <div className="flex items-center gap-5">
              <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center text-2xl font-bold">
                J
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">Julekha</h1>
                <span className="text-xs text-slate-400 font-bold block mt-1.5 uppercase tracking-wider">National Registration Token ID: BdMSO02606-001</span>
              </div>
            </div>

            {/* Profile Form Details Card */}
            <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <h3 className="font-bold text-base mb-4 tracking-tight border-b pb-2 dark:border-slate-800">Primary Candidate Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-semibold">
                
                <div>
                  <label className="block text-slate-400 mb-1">Full Student Name</label>
                  <input type="text" readOnly value="Julekha" className="w-full rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold outline-none" />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Primary School / Institution</label>
                  <input type="text" readOnly value="DRMC" className="w-full rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold outline-none" />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Class Level Grade</label>
                  <input type="text" readOnly value="Class 6" className="w-full rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold outline-none" />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Region District Venue</label>
                  <input type="text" readOnly value="Dhaka" className="w-full rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold outline-none" />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Assigned Exam Region</label>
                  <input type="text" readOnly value="Dhaka Central Division" className="w-full rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold outline-none" />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Candidate Gender Category</label>
                  <input type="text" readOnly value="Female" className="w-full rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold outline-none" />
                </div>

              </div>

              <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
                * Note: Your academic details are synced directly with the national database database keys from your school registration submissions. To correct name mistakes or school mappings, contact support desk.
              </p>
            </div>

            {/* Portal security access keys */}
            <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
              <h3 className="font-bold text-base mb-4 tracking-tight border-b pb-2 dark:border-slate-800">Account Access & Portal Security</h3>
              <div className="space-y-3.5 text-xs font-semibold">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="block font-bold">Portal Access Token Status</span>
                    <span className="text-[10px] text-slate-400">Authenticated on custom regional networks</span>
                  </div>
                  <span className="text-emerald-500 font-bold">Secure</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div>
                    <span className="block font-bold">Database ID Token</span>
                    <span className="font-mono text-slate-400 text-[10px]">AUTH_SESSION_TOKEN_19_MAY_2026_DRMC</span>
                  </div>
                  <button className="text-xs text-indigo-500 hover:underline">Copy Token Key</button>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* --- INTEGRATED MODAL 1: HIGH FIDELITY SECURE CHECKOUT SIMULATOR --- */}
      {paymentTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-3xl border p-6 w-full max-w-md shadow-2xl animate-scale-up ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4 border-b pb-3 dark:border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400">Secure Payment Clearing Gateway</span>
                <h3 className="font-bold text-lg">Checkout Simulation</h3>
              </div>
              <button 
                onClick={() => setPaymentTarget(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-lg p-1"
              >
                &times;
              </button>
            </div>

            {/* Target Details summary */}
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl mb-4 border border-slate-100 dark:border-slate-800">
              <span className="text-3xs uppercase tracking-wider text-slate-400 font-bold">Transaction Course Details</span>
              <p className="font-bold text-sm text-indigo-600 dark:text-indigo-400">{paymentTarget.title}</p>
              <p className="text-xs text-slate-500">Applicant: {paymentTarget.applicant}</p>
              <div className="flex justify-between items-center border-t border-slate-200/50 dark:border-slate-800/80 mt-2.5 pt-2">
                <span className="text-xs text-slate-400 font-semibold">Total Invoice Value:</span>
                <span className="text-base font-extrabold">৳ {paymentTarget.amount.toLocaleString()}</span>
              </div>
            </div>

            {/* Payment Method Tabs */}
            <div className="space-y-4">
              <div>
                <label className="block text-2xs uppercase tracking-wider text-slate-400 font-bold mb-1.5">Select Clearing Network</label>
                <div className="grid grid-cols-3 gap-2">
                  
                  <button 
                    onClick={() => { setPaymentMethod('bkash'); setPaymentError(''); }}
                    className={`rounded-xl py-2.5 text-xs font-bold border transition ${paymentMethod === 'bkash' ? 'bg-pink-600 border-pink-600 text-white' : 'bg-slate-50 dark:bg-slate-850 hover:bg-slate-100'}`}
                  >
                    bKash Wallet
                  </button>

                  <button 
                    onClick={() => { setPaymentMethod('nagad'); setPaymentError(''); }}
                    className={`rounded-xl py-2.5 text-xs font-bold border transition ${paymentMethod === 'nagad' ? 'bg-orange-500 border-orange-500 text-white' : 'bg-slate-50 dark:bg-slate-850 hover:bg-slate-100'}`}
                  >
                    Nagad Smart
                  </button>

                  <button 
                    onClick={() => { setPaymentMethod('card'); setPaymentError(''); }}
                    className={`rounded-xl py-2.5 text-xs font-bold border transition ${paymentMethod === 'card' ? 'bg-slate-900 border-slate-900 text-white dark:bg-slate-850' : 'bg-slate-50 dark:bg-slate-850 hover:bg-slate-100'}`}
                  >
                    Debit/Credit Card
                  </button>

                </div>
              </div>

              {/* Dynamic Billing forms based on Selection */}
              <form onSubmit={processPaymentSimulated} className="space-y-4">
                
                {paymentMethod !== 'card' ? (
                  <div>
                    <label className="block text-2xs uppercase text-slate-400 font-bold mb-1">{paymentMethod === 'bkash' ? 'bKash Mobile Wallet No' : 'Nagad Registered Mobile No'}</label>
                    <input 
                      type="number"
                      placeholder="e.g. 01712345678"
                      value={paymentDetails.mobileNo}
                      onChange={(e) => setPaymentDetails({ ...paymentDetails, mobileNo: e.target.value })}
                      required
                      className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none border focus:ring-2 focus:ring-indigo-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-2xs uppercase text-slate-400 font-bold mb-1">Enter 16-Digit Card Number</label>
                      <input 
                        type="number"
                        placeholder="4242 4242 4242 4242"
                        value={paymentDetails.cardNo}
                        onChange={(e) => setPaymentDetails({ ...paymentDetails, cardNo: e.target.value })}
                        required
                        className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none border focus:ring-2 focus:ring-indigo-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-2xs uppercase text-slate-400 font-bold mb-1">Expiry Date</label>
                        <input 
                          type="text"
                          placeholder="MM/YY"
                          value={paymentDetails.expiry}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, expiry: e.target.value })}
                          required
                          className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none border focus:ring-2 focus:ring-indigo-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                        />
                      </div>
                      <div>
                        <label className="block text-2xs uppercase text-slate-400 font-bold mb-1">CVC Code</label>
                        <input 
                          type="number"
                          placeholder="123"
                          value={paymentDetails.cvc}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, cvc: e.target.value })}
                          required
                          className={`w-full rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none border focus:ring-2 focus:ring-indigo-500 ${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {paymentError && <p className="text-xs text-rose-500 font-bold">⚠ {paymentError}</p>}

                {/* Simulated Progress Loader */}
                <button 
                  type="submit"
                  disabled={isProcessingPayment}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-3 rounded-xl transition flex items-center justify-center gap-2.5 shadow-md shadow-indigo-500/15 disabled:opacity-50"
                >
                  {isProcessingPayment ? (
                    <>
                      <div className="h-4.5 w-4.5 rounded-full border-2 border-white/40 border-t-white animate-spin"></div>
                      Encrypting & Clearing Transaction...
                    </>
                  ) : (
                    `Complete Secure Payment • ৳ ${paymentTarget.amount.toLocaleString()}`
                  )}
                </button>

              </form>
            </div>

          </div>
        </div>
      )}

      {/* --- INTEGRATED MODAL 2: DETAILED TAXATION RECEIPT VIEW --- */}
      {receiptTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`rounded-3xl border p-6 w-full max-w-lg shadow-2xl animate-scale-up ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            
            {/* Receipt Modal Header */}
            <div className="flex items-center justify-between mb-4 border-b pb-3 dark:border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400">BdMSO Digital Cleared Voucher</span>
                <h3 className="font-bold text-lg">Transaction Receipt</h3>
              </div>
              <button 
                onClick={() => setReceiptTarget(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold text-lg p-1"
              >
                &times;
              </button>
            </div>

            {/* Simulated Receipt Template */}
            <div className="border border-dashed p-6 rounded-2xl bg-white text-slate-950 font-medium text-xs space-y-4">
              
              <div className="text-center border-b pb-4 space-y-1">
                <h4 className="font-extrabold text-base tracking-tight leading-none text-indigo-600">BdMSO Olympiad Clearance Receipt</h4>
                <p className="text-3xs text-slate-400 uppercase tracking-widest font-bold">Official Digital Copy</p>
              </div>

              <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                <div>
                  <span className="block text-3xs text-slate-400 uppercase font-bold">Participant Name</span>
                  <span className="font-bold text-slate-900 text-xs">{receiptTarget.applicant}</span>
                </div>
                <div>
                  <span className="block text-3xs text-slate-400 uppercase font-bold">Standard Candidate ID</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">{receiptTarget.bdmsoId}</span>
                </div>
                <div>
                  <span className="block text-3xs text-slate-400 uppercase font-bold">Transaction Key ID</span>
                  <span className="font-mono font-bold text-indigo-600 text-xs">{receiptTarget.txnId}</span>
                </div>
                <div>
                  <span className="block text-3xs text-slate-400 uppercase font-bold">Cleared On Date</span>
                  <span className="font-bold text-slate-900 text-xs">{receiptTarget.paidOn}</span>
                </div>
              </div>

              <div className="border-t pt-4">
                <span className="block text-3xs text-slate-400 uppercase font-bold mb-2">Invoice Summary Items</span>
                <div className="flex justify-between font-bold text-slate-900">
                  <span>{receiptTarget.title} (Registration Fee)</span>
                  <span>৳ {receiptTarget.amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="border-t pt-4 flex justify-between items-center font-extrabold text-slate-900 text-sm">
                <span>Total Cleared Paid Status:</span>
                <span className="text-emerald-600">৳ {receiptTarget.amount.toLocaleString()}</span>
              </div>

              <div className="text-center pt-2 text-[10px] text-slate-400">
                <p>Verify this digital document with key entries at any regional selection center.</p>
                <p className="font-bold text-slate-500 mt-0.5">Thank you for participating in BdMSO 2026!</p>
              </div>

            </div>

            {/* Download close buttons */}
            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setReceiptTarget(null)}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold text-xs px-5 py-2.5 rounded-xl transition"
              >
                Close Receipt
              </button>
              <button 
                onClick={() => {
                  window.print();
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-md shadow-indigo-500/10"
              >
                🖨 Print / Save PDF
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- REUSABLE FOOTER SYSTEM --- */}
      <footer className={`border-t py-8 mt-12 transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">Bangladesh Primary School Math & Science Olympiad (BdMSO 2026)</p>
          <p className="text-3xs font-medium">All rights reserved. Secure HTTPS checkout certified. Powered by BdMSO Academic Committee 2026.</p>
        </div>
      </footer>

    </div>
  );
}
