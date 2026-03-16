
import React, { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, Info, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';

interface Notification {
    id: string;
    targetCompany: string;
    title: string;
    message: string;
    isRead: boolean;
    date: string;
    link?: string;
}

const NotificationCenter: React.FC = () => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const { selectedCompany } = useAppStore();

    useEffect(() => {
        const loadNotifications = () => {
            const allNotifs: Notification[] = JSON.parse(localStorage.getItem('gtk_notifications') || '[]');
            // Filter for current company
            const filtered = allNotifs.filter(n => n.targetCompany === selectedCompany);
            setNotifications(filtered.reverse());
        };

        loadNotifications();
        // Poll for new notifications every 10 seconds
        const interval = setInterval(loadNotifications, 10000);
        return () => clearInterval(interval);
    }, [selectedCompany]);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const markAsRead = (id: string) => {
        const allNotifs: Notification[] = JSON.parse(localStorage.getItem('gtk_notifications') || '[]');
        const updated = allNotifs.map(n => n.id === id ? { ...n, isRead: true } : n);
        localStorage.setItem('gtk_notifications', JSON.stringify(updated));
        setNotifications(updated.filter(n => n.targetCompany === selectedCompany).reverse());
    };

    const clearAll = () => {
        const allNotifs: Notification[] = JSON.parse(localStorage.getItem('gtk_notifications') || '[]');
        const remaining = allNotifs.filter(n => n.targetCompany !== selectedCompany);
        localStorage.setItem('gtk_notifications', JSON.stringify(remaining));
        setNotifications([]);
    };

    const handleNotificationClick = (n: Notification) => {
        markAsRead(n.id);
        if (n.link) {
            navigate(n.link);
            setIsOpen(false);
        }
    };

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="hover:bg-white/10 p-2 rounded-full relative transition-colors"
            >
                <Bell size={18} className="text-white" />
                {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 rounded-full border-2 border-[#354a5f] flex items-center justify-center text-[8px] font-black text-white">
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden animate-in slide-in-from-top-2 duration-200">
                        <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                            <h4 className="font-black uppercase text-[10px] text-slate-500 tracking-widest">Notifications</h4>
                            {notifications.length > 0 && (
                                <button onClick={clearAll} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase">Clear All</button>
                            )}
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center space-y-2">
                                    <Info size={24} className="mx-auto text-slate-300" />
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">No new alerts</p>
                                </div>
                            ) : (
                                notifications.map(n => (
                                    <div 
                                        key={n.id} 
                                        onClick={() => handleNotificationClick(n)}
                                        className={`p-4 border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50 ${!n.isRead ? 'bg-blue-50/30' : ''}`}
                                    >
                                        <div className="flex items-start space-x-3">
                                            <div className={`mt-0.5 ${n.title.includes('Approved') ? 'text-emerald-500' : 'text-blue-500'}`}>
                                                {n.title.includes('Approved') ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <p className="text-[11px] font-black text-slate-900 uppercase leading-tight">{n.title}</p>
                                                <p className="text-[10px] font-medium text-slate-500 leading-relaxed">{n.message}</p>
                                                <p className="text-[8px] font-bold text-slate-400 uppercase">{new Date(n.date).toLocaleTimeString()}</p>
                                            </div>
                                            {!n.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1" />}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default NotificationCenter;
