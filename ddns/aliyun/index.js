var getRawBody = require('raw-body');
var Core = require('@alicloud/pop-core');

/**
 * parse params from raw body
 * @param {*} req 
 * @returns 
 */
const getData = async (req) => {
  let body = await getRawBody(req);
  body = JSON.parse(body);
  const { ttl = 600, type = 'A', domain, record, ip, priority = 1, id, secret } = body;
  return {
    ttl,
    type,
    domain,
    record,
    ip,
    priority,
    fullDomain: `${record}.${domain}`,
    id,
    secret
  };
}

const createClientInst = (params) => {
  const { id, secret } = params;
  const client = new Core({
    accessKeyId: id,
    accessKeySecret: secret,
    endpoint: 'https://alidns.aliyuncs.com',
    apiVersion: '2015-01-09'
  });
  return client;
}

/**
 * Get all related records
 * @param {*} params 
 * @param {*} inst 
 * @returns 
 */
const getRecordList = async (params, inst) => {
  let recordList = [], success = false;
  try {
    const { type, domain, record } = params;
    const res = await inst.request('DescribeDomainRecords', {
      "DomainName": domain,
      "RRKeyWord": record,
      "Type": type
    }, {
      "method": "GET"
    });
    if (!res?.DomainRecords?.Record?.length) {
      throw new Error('get record list error');
    }
    success = true;
    recordList = res?.DomainRecords?.Record || [];
  } catch (e) {
    recordList = [];
  }

  return { recordList, success };
}

const findRecord = (recordList, params) => {
  const { domain, record } = params;
  const rec = recordList.find(function (_record) {
    return _record.DomainName === domain && _record.RR === record;
  });
  return rec
}


/**
 * update dns record
 * @param {*} params 
 * @param {*} record 
 * @param {*} inst 
 * @returns
 */
const updateDNSRecord = async (params, record, inst) => {
  let success = false;
  try {
    const { ip, ttl, type, line, priority } = params;
    const params2 = {
      "RR": record.RR,
      "RecordId": record.RecordId,
      "Type": type || record.Type,
      "Value": ip,
      "TTL": ttl || record.TTL,
      "Line": line || record.Line,
      "Priority": priority || record.Weight
    };
    await inst.request('UpdateDomainRecord', params2, { "method": "GET" });
    success = true;
  } catch (e) {
  }
  return success;
}


exports.handler = async (req, resp, context) => {
  try {
    const params = await getData(req);
    const { fullDomain, ip, id, secret } = params;
    const msg = `\n domain: ${fullDomain} \n ip: ${ip}`;

    if (!id || !secret) {
      resp.send(JSON.stringify({ status: 'failed', code: 1, msg: `params is invalid！${msg}` }));
      return;
    }

    const client = createClientInst(params);

    const { recordList, success } = await getRecordList(params, client);

    if (!success) {
      resp.send(JSON.stringify({ status: 'failed', code: 1, msg: `query dns record error！${msg}` }));
      return;
    }

    const dnsRecord = findRecord(recordList, params);
    if (!dnsRecord || ip === dnsRecord.Value) {
      const msg = dnsRecord ? `ip not change ~` : `can't find record for ${fullDomain}!`
      resp.send(JSON.stringify({ status: 'failed', code: 1, msg }));
      return;
    }

    const updateSuccess = await updateDNSRecord(params, dnsRecord, client);
    if (!updateSuccess) {
      resp.send(JSON.stringify({ status: 'failed', code: 1, msg: `Update dns record failed!` }));
      return;
    }

    resp.setStatusCode(200)
    resp.setHeader('content-type', 'application/json')
    resp.send(JSON.stringify({ status: 'success', code: 0, msg: `Update dns record succeeded!` }));
  } catch (e) {
    resp.send(JSON.stringify({ status: 'failed', code: 1, msg: `Update dns record failed!` }));
  }
}