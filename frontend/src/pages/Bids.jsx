import React, { useState, useEffect } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { io } from 'socket.io-client';

const Bids = () => {
  const [bids, setBids] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedBid, setSelectedBid] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [formData, setFormData] = useState({
    enquiryId: '',
    amount: '',
    industry: 'Technology',
    submissionDate: '',
    assignedEmployee: '',
    remarks: ''
  });

  const fetchBids = async () => {
    try {
      const res = await api.get('/bids/');
      setBids(res.data);
    } catch (err) {
      toast.error("Failed to fetch bids");
    }
  };

  const fetchEnquiries = async () => {
    try {
      const res = await api.get('/enquiries/');
      setEnquiries(res.data);
    } catch (err) {
      toast.error("Failed to fetch enquiries");
    }
  };

  useEffect(() => {
    fetchBids();
    fetchEnquiries();
    
    const socket = io('http://localhost:5000');
    
    socket.on('new_comment', (data) => {
      setBids(prevBids => prevBids.map(bid => {
        if (bid._id === data.bid_id) {
          // Check if comment already exists (e.g., if we're the sender)
          const commentExists = bid.comments && bid.comments.some(c => 
            c.text === data.comment.text && c.author === data.comment.author && c.date === data.comment.date
          );
          if (commentExists) return bid;
          return { ...bid, comments: [...(bid.comments || []), data.comment] };
        }
        return bid;
      }));
      
      setSelectedBid(prevSelected => {
        if (prevSelected && prevSelected._id === data.bid_id) {
          const commentExists = prevSelected.comments && prevSelected.comments.some(c => 
            c.text === data.comment.text && c.author === data.comment.author && c.date === data.comment.date
          );
          if (commentExists) return prevSelected;
          return { ...prevSelected, comments: [...(prevSelected.comments || []), data.comment] };
        }
        return prevSelected;
      });
    });
    
    return () => socket.disconnect();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/bids/', formData);
      setShowModal(false);
      fetchBids();
      toast.success("Bid created successfully!");
    } catch (err) {
      toast.error("Failed to create bid");
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/bids/${id}/status`, { status });
      fetchBids();
      toast.success("Status updated");
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const getStatusBadgeClass = (status) => {
    if (['Order Received', 'Completed'].includes(status)) return 'success';
    if (['Rejected', 'Lost'].includes(status)) return 'danger';
    if (['Submitted', 'Negotiation'].includes(status)) return 'info';
    return 'review';
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText || !selectedBid) return;
    try {
      await api.post(`/bids/${selectedBid._id}/comments`, { text: commentText });
      setCommentText("");
      fetchBids();
      toast.success("Comment added");
      const res = await api.get('/bids/');
      const updatedBids = res.data;
      setBids(updatedBids);
      setSelectedBid(updatedBids.find(b => b._id === selectedBid._id));
    } catch (err) {
      toast.error("Failed to post comment");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <div className="bids-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Bid Management</h1>
        <button className="btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
          + Create Bid
        </button>
      </div>

      <div className="glass-card data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bid ID</th>
              <th>Enquiry ID</th>
              <th>Amount</th>
              <th>Prediction</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bids.map(bid => (
              <tr key={bid._id}>
                <td style={{ fontWeight: 600 }}>{bid.bidId}</td>
                <td>{bid.enquiryId}</td>
                <td style={{ fontWeight: 500 }}>{formatCurrency(bid.amount)}</td>
                <td title="Prediction based on amount, deadline, and customer history">
                  {bid.aiPrediction ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)',
                      color: bid.aiPrediction >= 70 ? 'var(--success)' : (bid.aiPrediction >= 40 ? 'var(--warning)' : 'var(--danger)')
                    }}>
                      {bid.aiPrediction >= 70 ? '🟢' : (bid.aiPrediction >= 40 ? '🟡' : '🔴')} {bid.aiPrediction}% 
                      <span style={{color: 'var(--text-secondary)', marginLeft: '4px', fontWeight: 'normal'}}>
                        {bid.aiPrediction >= 70 ? 'High' : (bid.aiPrediction >= 40 ? 'Medium' : 'Risk')}
                      </span>
                    </span>
                  ) : 'N/A'}
                </td>
                <td>
                  <span className={`status-badge ${getStatusBadgeClass(bid.status)}`}>
                    {bid.status}
                  </span>
                </td>
                <td>{bid.assignedEmployee}</td>
                <td style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="input-field" 
                    style={{ padding: '6px', fontSize: '0.8rem', width: 'auto' }}
                    value={bid.status}
                    onChange={(e) => updateStatus(bid._id, e.target.value)}
                  >
                    <option>Quotation Prepared</option>
                    <option>Submitted</option>
                    <option>Negotiation</option>
                    <option>Approved / Rejected</option>
                    <option>Order Received</option>
                    <option>Completed</option>
                    <option>Rejected</option>
                  </select>
                  <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => { setSelectedBid(bid); setShowCommentModal(true); }}>
                    Comments ({bid.comments ? bid.comments.length : 0})
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={modalOverlayStyle}>
          <div className="glass-card" style={modalContentStyle}>
            <h2 style={{ marginBottom: '24px' }}>Create New Bid</h2>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>Select Enquiry</label>
                <select className="input-field" required value={formData.enquiryId} onChange={e => setFormData({...formData, enquiryId: e.target.value})}>
                  <option value="">-- Select --</option>
                  {enquiries.map(enq => (
                    <option key={enq.enquiryId} value={enq.enquiryId}>{enq.enquiryId} - {enq.customerName}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Bid Amount ($)</label>
                <input type="number" className="input-field" required value={formData.amount} onChange={e => setFormData({...formData, amount: Number(e.target.value)})} />
              </div>
              <div className="input-group">
                <label>Submission Date</label>
                <input type="date" className="input-field" required value={formData.submissionDate} onChange={e => setFormData({...formData, submissionDate: e.target.value})} />
              </div>
              <div className="input-group">
                <label>Assigned Employee</label>
                <input className="input-field" required value={formData.assignedEmployee} onChange={e => setFormData({...formData, assignedEmployee: e.target.value})} />
              </div>
              <div className="input-group">
                <label>Client Industry</label>
                <select className="input-field" value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})}>
                  <option value="Technology">Technology</option>
                  <option value="Banking">Banking</option>
                  <option value="Manufacturing">Manufacturing</option>
                  <option value="Retail">Retail</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCommentModal && selectedBid && (
        <div style={modalOverlayStyle}>
          <div className="glass-card" style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Comments - {selectedBid.bidId}</h2>
              <button style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => setShowCommentModal(false)}>✕</button>
            </div>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedBid.comments && selectedBid.comments.length > 0 ? (
                selectedBid.comments.map((c, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      <strong style={{ color: 'var(--accent-primary)' }}>{c.author}</strong>
                      <span>{format(new Date(c.date), 'MMM dd, yyyy h:mm a')}</span>
                    </div>
                    <div>{c.text}</div>
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-secondary)' }}>No comments yet.</div>
              )}
            </div>

            <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                className="input-field" 
                style={{ flex: 1 }} 
                placeholder="Add a comment..." 
                value={commentText} 
                onChange={(e) => setCommentText(e.target.value)} 
                required 
              />
              <button type="submit" className="btn-primary" style={{ width: 'auto' }}>Send</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const modalOverlayStyle = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.8)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000
};

const modalContentStyle = {
  width: '100%',
  maxWidth: '500px',
  background: 'var(--bg-secondary)',
};

export default Bids;
