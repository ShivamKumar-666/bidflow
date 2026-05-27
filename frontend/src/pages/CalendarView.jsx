import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, ExternalLink } from 'lucide-react';
import api from '../services/api';
import { AuthContext } from '../contexts/AuthContext';
import './CalendarView.css';

const CalendarView = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useContext(AuthContext);

  // States
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [upcomingBids, setUpcomingBids] = useState([]);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed

  // Translations helpers with fallbacks
  const transTitle = t('calendar.title', 'Calendar & Deadlines');
  const transUpcoming = t('calendar.upcomingDeadlines', 'Upcoming Deadlines');
  const transNoDeadlines = t('calendar.noDeadlines', 'No upcoming deadlines');
  const transPriority = t('calendar.priority', 'Priority');
  const transAmount = t('calendar.amount', 'Amount');
  const transStatus = t('calendar.status', 'Status');
  const transPrediction = t('calendar.prediction', 'AI Prediction');
  const transAssignedTo = t('calendar.assignedTo', 'Assigned To');
  const transViewDetails = t('calendar.viewDetails', 'Manage Bid & Discussion');
  const transClose = t('calendar.close', 'Close');

  const weekdays = [
    t('calendar.days.sun', 'Sun'),
    t('calendar.days.mon', 'Mon'),
    t('calendar.days.tue', 'Tue'),
    t('calendar.days.wed', 'Wed'),
    t('calendar.days.thu', 'Thu'),
    t('calendar.days.fri', 'Fri'),
    t('calendar.days.sat', 'Sat'),
  ];

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const transMonth = t(`calendar.months.${monthNames[currentMonth].toLowerCase()}`, monthNames[currentMonth]);

  // Fetch Bids Calendar Events
  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        const response = await api.get(`/bids/calendar?month=${monthStr}`);
        setEvents(response.data || []);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [currentYear, currentMonth]);

  // Fetch all upcoming bids (deadline clustering)
  useEffect(() => {
    const fetchAllBids = async () => {
      try {
        const response = await api.get('/bids/calendar');
        const sortedActive = (response.data || [])
          .filter(bid => bid.status !== 'Order Received' && bid.status !== 'Rejected')
          .sort((a, b) => new Date(a.submissionDate) - new Date(b.submissionDate));
        
        setUpcomingBids(sortedActive.slice(0, 10)); // Top 10 upcoming deadlines
      } catch (error) {
        console.error('Error fetching upcoming bids:', error);
      }
    };
    fetchAllBids();
  }, []);

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Calendar Math
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const calendarDays = [];

  // Previous month padding
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarDays.push({ day, isCurrentMonth: false, dateStr });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    calendarDays.push({ day: i, isCurrentMonth: true, dateStr });
  }

  // Next month padding to fill grid
  const remainingCells = 42 - calendarDays.length; // Standard 6-week layout
  for (let i = 1; i <= remainingCells; i++) {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    calendarDays.push({ day: i, isCurrentMonth: false, dateStr });
  }

  // Priority styling resolver
  const getPriorityClass = (priority) => {
    const p = String(priority).toLowerCase();
    if (p === 'high') return 'priority-high';
    if (p === 'medium') return 'priority-medium';
    return 'priority-low';
  };

  const getPriorityLabel = (priority) => {
    const p = String(priority).toLowerCase();
    if (p === 'high') return t('enquiries.high', 'High');
    if (p === 'medium') return t('enquiries.medium', 'Medium');
    return t('enquiries.low', 'Low');
  };

  const getStatusText = (status) => {
    const normalized = String(status).toLowerCase().replace(/\s+/g, '_');
    return t(`bids.statusValue.${normalized}`, status);
  };

  const isToday = (dateStr) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dateStr === todayStr;
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{transTitle}</h1>
      </div>

      <div className="calendar-view-container">
        {/* Left Side: Calendar Main Grid */}
        <div className="calendar-main glass-panel">
          <div className="calendar-header">
            <div className="calendar-nav">
              <button className="nav-btn" onClick={handlePrevMonth} title="Previous Month">
                <ChevronLeft size={20} />
              </button>
              <button className="nav-btn-today" onClick={handleToday}>
                {t('calendar.todayBtn', 'Today')}
              </button>
              <button className="nav-btn" onClick={handleNextMonth} title="Next Month">
                <ChevronRight size={20} />
              </button>
            </div>
            <h2 className="month-title">{transMonth} {currentYear}</h2>
            <div style={{ width: '120px' }}></div> {/* Spacer to keep month title centered */}
          </div>

          <div className="weekdays-grid">
            {weekdays.map((day, index) => (
              <div key={index} className="weekday-header">
                {day}
              </div>
            ))}
          </div>

          <div className="days-grid">
            {calendarDays.map((cell, index) => {
              const dayEvents = events.filter(e => e.submissionDate === cell.dateStr);
              return (
                <div
                  key={index}
                  className={`day-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${isToday(cell.dateStr) ? 'today' : ''}`}
                >
                  <span className="day-number">{cell.day}</span>
                  <div className="day-events">
                    {dayEvents.map(event => (
                      <div
                        key={event._id}
                        className={`event-pill ${getPriorityClass(event.priority)}`}
                        onClick={() => setSelectedEvent(event)}
                      >
                        <span className="priority-indicator"></span>
                        <span className="event-pill-text">
                          {event.customerName}: ${Number(event.amount).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Upcoming Deadlines List */}
        <div className="calendar-sidebar glass-panel">
          <h3>{transUpcoming}</h3>
          {upcomingBids.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{transNoDeadlines}</p>
          ) : (
            <div className="upcoming-list">
              {upcomingBids.map(bid => (
                <div
                  key={bid._id}
                  className={`upcoming-item ${getPriorityClass(bid.priority)}`}
                  onClick={() => setSelectedEvent(bid)}
                >
                  <div className="upcoming-header">
                    <span className="upcoming-title">{bid.customerName}</span>
                    <span className="upcoming-date">{bid.submissionDate}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '4px' }}>
                    {bid.productServiceRequired}
                  </div>
                  <div className="upcoming-details">
                    <span>${Number(bid.amount).toLocaleString()}</span>
                    <span className="status-badge info" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                      {getStatusText(bid.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedEvent(null)}>
              <X size={20} />
            </button>

            <div className="modal-title-wrap">
              <div className="modal-bid-id">{selectedEvent.bidId}</div>
              <h2 className="modal-customer">{selectedEvent.customerName}</h2>
            </div>

            <div className="modal-details-grid">
              <div className="modal-detail-item">
                <span className="modal-detail-label">{transPriority}</span>
                <span className="modal-detail-value">
                  <span className={`status-badge ${selectedEvent.priority === 'High' ? 'danger' : selectedEvent.priority === 'Medium' ? 'review' : 'info'}`}>
                    {getPriorityLabel(selectedEvent.priority)}
                  </span>
                </span>
              </div>
              <div className="modal-detail-item">
                <span className="modal-detail-label">{transAmount}</span>
                <span className="modal-detail-value">${Number(selectedEvent.amount).toLocaleString()}</span>
              </div>
              <div className="modal-detail-item">
                <span className="modal-detail-label">{t('calendar.dueDate', 'Due Date')}</span>
                <span className="modal-detail-value">{selectedEvent.submissionDate}</span>
              </div>
              <div className="modal-detail-item">
                <span className="modal-detail-label">{transStatus}</span>
                <span className="modal-detail-value">
                  <span className="status-badge info">{getStatusText(selectedEvent.status)}</span>
                </span>
              </div>
              <div className="modal-detail-item" style={{ gridColumn: 'span 2' }}>
                <span className="modal-detail-label">{t('calendar.serviceRequired', 'Service/Product Required')}</span>
                <span className="modal-detail-value">{selectedEvent.productServiceRequired}</span>
              </div>
              <div className="modal-detail-item">
                <span className="modal-detail-label">{transAssignedTo}</span>
                <span className="modal-detail-value">{selectedEvent.assignedEmployee || 'Unassigned'}</span>
              </div>
              <div className="modal-detail-item">
                <span className="modal-detail-label">{transPrediction}</span>
                <div className="prediction-wrapper">
                  <span className="modal-detail-value" style={{ color: 'var(--success)' }}>
                    {selectedEvent.aiPrediction}%
                  </span>
                  <div className="prediction-bar-container">
                    <div
                      className="prediction-bar"
                      style={{ width: `${selectedEvent.aiPrediction}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {selectedEvent.remarks && (
              <div className="modal-remarks">
                <span className="modal-detail-label">{t('calendar.remarks', 'Remarks')}</span>
                <span className="modal-detail-value" style={{ fontWeight: 'normal', fontSize: '0.9rem' }}>
                  {selectedEvent.remarks}
                </span>
              </div>
            )}

            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => {
                  setSelectedEvent(null);
                  navigate('/bids');
                }}
              >
                <ExternalLink size={18} />
                <span>{transViewDetails}</span>
              </button>
              <button
                className="btn-outline"
                style={{ width: '100%', padding: '12px' }}
                onClick={() => setSelectedEvent(null)}
              >
                {transClose}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
